"""
End-to-end test: FunASR realtime pipeline + coach trigger engine.

Exercises the complete chain:
1. VAD (fsmn-vad) -> ASR (paraformer-zh) -> Speaker Clustering (cam++)
2. Trigger engine rule evaluation (8 YAML rules) with injected text
3. Coach prompt building (7 action templates)
4. End-to-end LLM coach tip generation via DeepSeek
5. Context-based triggers (silence, multi-party, cooldown)

Phase 2 uses hardcoded Chinese text to reliably test all 5 text-match
trigger rules without depending on TTS-to-ASR transcription quality.
"""
import asyncio
import json
import time
import wave
import sys

sys.path.insert(0, ".")

from app.services.realtime_asr import StreamingTranscriber
from app.services.trigger_engine import RuleEngine, CoachPromptBuilder

AUDIO = "test_data/coach_dialogue_16k.wav"

PASSED = 0
FAILED = 0


def check(phase: str, condition: bool, detail: str = ""):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  [PASS] {phase}: {detail}")
    else:
        FAILED += 1
        print(f"  [FAIL] {phase}: {detail}")


# ============================================================================
# Phase 1: ASR + Speaker Diarization (Real Audio)
# ============================================================================

print("=" * 60)
print("Phase 1: FunASR Realtime Pipeline (ASR + Speaker Diarization)")
print("=" * 60)

with wave.open(AUDIO, "rb") as wf:
    sr = wf.getframerate()
    assert sr == 16000 and wf.getnchannels() == 1
    audio = wf.readframes(wf.getnframes())
    duration = len(audio) / (sr * 2)

print(f"Audio: {duration:.1f}s | {len(audio)} bytes")

tc = StreamingTranscriber(
    sample_rate=16000,
    min_speech_duration_ms=1000,
    max_speech_duration_s=12.0,
    enable_speaker_clustering=True,
)

t0 = time.perf_counter()
chunk_size = 3200
all_segments = []
for i in range(0, len(audio), chunk_size):
    chunk = audio[i : i + chunk_size]
    if len(chunk) < chunk_size:
        break
    segs = tc.feed_chunk(chunk)
    all_segments.extend(segs)

asr_time = time.perf_counter() - t0
speakers = tc.get_speaker_names()
tc.reset()

print(f"Segments: {len(all_segments)} | Speakers: {len(speakers)} | RTF: {asr_time/duration:.3f}")
print(f"Speaker mapping: {speakers}")

if all_segments:
    print("\n--- Transcript ---")
    for seg in all_segments:
        spk = speakers.get(seg.speaker, seg.speaker)
        print(f"  [{spk}] {seg.start:.1f}s-{seg.end:.1f}s: {seg.text}")

check("Phase 1", len(all_segments) >= 4, f"{len(all_segments)} segments detected (need >= 4)")
check("Phase 1", len(speakers) >= 1, f"{len(speakers)} speakers detected (need >= 1)")
check("Phase 1", asr_time / duration < 2.0, f"RTF {asr_time/duration:.3f} < 2.0 (real-time capable)")

# ============================================================================
# Phase 2: Trigger Engine — Text Pattern Matching (Hardcoded Text)
# ============================================================================

print("\n" + "=" * 60)
print("Phase 2: Trigger Engine — 5 Text-Match Rules")
print("=" * 60)

# Test cases: (rule_id, input_text, should_fire)
TEXT_RULE_TESTS = [
    # hesitation: pattern "嗯+|呃+|这个...+|那个...+"
    ("hesitation", "嗯...这个产品我觉得还要再看看", True),
    ("hesitation", "呃那个收益率好像不是很高", True),
    ("hesitation", "我觉得收益还可以接受", False),  # no hesitation markers (这个/那个 are common words)

    # price_objection: pattern "太贵|便宜|折扣|优惠|费率|费用|价格"
    ("price_objection", "这个产品太贵了吧", True),
    ("price_objection", "能不能给点折扣或者优惠", True),
    ("price_objection", "费率方面有什么优势吗", True),
    ("price_objection", "我觉得收益还可以", False),

    # competitor_mention: pattern "别的|其他公司|某行|某平台|对比|别家|他们"
    ("competitor_mention", "别的公司好像收益更高", True),
    ("competitor_mention", "我跟其他公司对比了一下", True),
    ("competitor_mention", "他们那边好像更便宜一些", True),
    ("competitor_mention", "这个产品风险等级是多少", False),

    # commitment_signal: pattern "可以试试|怎么签约|先买|办一个|来一份|怎么办理"
    ("commitment_signal", "那可以先买一点试试看", True),
    ("commitment_signal", "怎么签约呢流程是什么", True),
    ("commitment_signal", "我还想再了解一下", False),

    # objection: pattern "不行|不考虑|算了|不需要|再说|再想想|暂时不"
    ("objection", "算了算了不办了", True),
    ("objection", "我再想想吧暂时不考虑", True),
    ("objection", "我对这个方案挺满意的", False),
]

rule_engine = RuleEngine()
text_rule_passed = 0
text_rule_total = 0

for rule_id, text, should_fire in TEXT_RULE_TESTS:
    rule_engine.reset()  # clear cooldowns between tests
    triggers = rule_engine.evaluate(text=text)
    fired_ids = [t.rule_id for t in triggers]
    fired = rule_id in fired_ids
    text_rule_total += 1
    if fired == should_fire:
        text_rule_passed += 1
    else:
        status = "FIRED" if fired else "NO TRIGGER"
        expected = "should fire" if should_fire else "should NOT fire"
        print(f"  [FAIL] {rule_id}: text='{text[:30]}' -> {status} ({expected})")

check("Phase 2", text_rule_passed == text_rule_total,
      f"{text_rule_passed}/{text_rule_total} text-match rule tests passed")

# Also verify each rule type can be triggered at least once
rule_engine.reset()
all_rule_fires = set()
for rule_id, text, should_fire in TEXT_RULE_TESTS:
    if should_fire:
        rule_engine.reset()
        triggers = rule_engine.evaluate(text=text)
        for t in triggers:
            all_rule_fires.add(t.rule_id)

expected_rules = {"hesitation", "price_objection", "competitor_mention", "commitment_signal", "objection"}
check("Phase 2", all_rule_fires == expected_rules,
      f"All 5 text rules fireable: {all_rule_fires}")

# ============================================================================
# Phase 3: Coach Prompt Building (7 Action Templates)
# ============================================================================

print("\n" + "=" * 60)
print("Phase 3: Coach Prompt Builder — 7 Action Templates")
print("=" * 60)

coach_builder = CoachPromptBuilder()

# Verify all 7 action templates exist
check("Phase 3", len(CoachPromptBuilder.ACTION_PROMPTS) == 7,
      f"{len(CoachPromptBuilder.ACTION_PROMPTS)} action templates (need 7)")

# Verify each template is valid
for action, template in CoachPromptBuilder.ACTION_PROMPTS.items():
    has_transcript = "{transcript}" in template
    check("Phase 3", has_transcript and len(template) > 50,
          f"Template '{action}': valid ({len(template)} chars)")

# Build a prompt for each action type using test data
rule_engine.reset()
test_transcript = [
    {"speaker": "销售", "text": "您好王先生，我是您的理财顾问小李。"},
    {"speaker": "客户", "text": "你好，我想了解一下你们的理财产品。"},
    {"speaker": "销售", "text": "好的，我先介绍一下我们的稳健型产品体系。"},
    {"speaker": "客户", "text": "嗯...这个产品太贵了吧，别的公司好像更便宜。"},
]

# Simulate each action type
test_actions = [
    ("hesitation", "coach_tip", "嗯...这个产品"),
    ("price_objection", "coach_tip", "太贵了吧"),
    ("competitor_mention", "strategy_alert", "别的公司好像更便宜"),
    ("commitment_signal", "closing_guide", "可以先买一点试试"),
    ("objection", "objection_handle", "算了不考虑了"),
]

from app.services.trigger_engine import TriggerMatch

for rule_id, action, matched_text in test_actions:
    trigger = TriggerMatch(
        rule_id=rule_id,
        action=action,
        matched_text=matched_text,
        context={"condition": f"test_{rule_id}"},
    )
    prompt = coach_builder.build_prompt(
        trigger=trigger,
        recent_transcript=test_transcript,
        customer_profile="测试客户：40岁男性，稳健型投资者",
    )
    check("Phase 3", len(prompt) > 100,
          f"[{rule_id}] prompt built: {len(prompt)} chars")

# ============================================================================
# Phase 4: End-to-End LLM Coach Tip Generation
# ============================================================================

print("\n" + "=" * 60)
print("Phase 4: End-to-End LLM Coach Tip (DeepSeek)")
print("=" * 60)

rule_engine.reset()

# Use a clear price_objection trigger for the LLM test
triggers = rule_engine.evaluate(text="这个产品太贵了吧，别的公司好像更便宜")
fired = [t for t in triggers if t.rule_id == "price_objection"]

if fired:
    test_trigger = fired[0]
    print(f"Testing: {test_trigger.rule_id} (action={test_trigger.action})")

    async def test_llm():
        return await coach_builder.generate_coach_tip(
            trigger=test_trigger,
            recent_transcript=test_transcript,
            customer_profile="客户：40岁男性，稳健型投资者，资产500万，关注费率和安全性",
            stream=False,
        )

    t_llm = time.perf_counter()
    coach_tip = asyncio.run(test_llm())
    llm_time = time.perf_counter() - t_llm

    print(f"  LLM response ({llm_time:.1f}s, {len(coach_tip)} chars):")
    print(f"  {'-' * 56}")
    for line in coach_tip.strip().split("\n"):
        print(f"  | {line}")
    print(f"  {'-' * 56}")

    check("Phase 4", len(coach_tip.strip()) > 20,
          f"Coach tip generated: {len(coach_tip)} chars in {llm_time:.1f}s")
else:
    print("  price_objection trigger did not fire — check pattern")
    check("Phase 4", False, "price_objection trigger should have fired")

# Test a second trigger type (objection_handle)
rule_engine.reset()
triggers2 = rule_engine.evaluate(text="算了算了，我觉得还是不考虑了")
obj_triggers = [t for t in triggers2 if t.rule_id == "objection"]
if obj_triggers:
    async def test_objection_llm():
        return await coach_builder.generate_coach_tip(
            trigger=obj_triggers[0],
            recent_transcript=test_transcript,
            customer_profile="",
            stream=False,
        )
    tip2 = asyncio.run(test_objection_llm())
    check("Phase 4", len(tip2.strip()) > 20,
          f"objection_handle tip: {len(tip2)} chars")
else:
    check("Phase 4", False, "objection trigger should have fired")

# ============================================================================
# Phase 5: Context Triggers (Silence, Multi-party, Cooldown, Sentiment)
# ============================================================================

print("\n" + "=" * 60)
print("Phase 5: Context Triggers (Silence / Multi-party / Cooldown / Sentiment)")
print("=" * 60)

rule_engine.reset()

# 5a: long_silence (timeout=10s)
triggers = rule_engine.evaluate(text="", silence_duration=12.0)
check("Phase 5", any(t.rule_id == "long_silence" for t in triggers),
      "long_silence fires at 12s silence")

# 5b: long_silence should NOT fire below threshold
rule_engine.reset()
triggers = rule_engine.evaluate(text="", silence_duration=5.0)
check("Phase 5", not any(t.rule_id == "long_silence" for t in triggers),
      "long_silence does NOT fire at 5s silence")

# 5c: multi_party (speaker_count >= 3)
rule_engine.reset()
triggers = rule_engine.evaluate(text="大家好今天我们开个理财会议", speaker_count=3)
check("Phase 5", any(t.rule_id == "multi_party" for t in triggers),
      "multi_party fires with 3 speakers")

# 5d: multi_party should NOT fire with 2 speakers
rule_engine.reset()
triggers = rule_engine.evaluate(text="你好", speaker_count=2)
check("Phase 5", not any(t.rule_id == "multi_party" for t in triggers),
      "multi_party does NOT fire with 2 speakers")

# 5e: cooldown — same rule should not fire twice in cooldown window
rule_engine.reset()
t1 = rule_engine.evaluate(text="太贵了吧")
check("Phase 5", any(t.rule_id == "price_objection" for t in t1),
      "price_objection fires (1st time)")
t2 = rule_engine.evaluate(text="太贵了太贵了")
check("Phase 5", not any(t.rule_id == "price_objection" for t in t2),
      "price_objection on cooldown (no 2nd fire)")

# 5f: sentiment trigger (threshold=0.4)
sentiment_trigger = rule_engine.evaluate_sentiment(delta=0.5)
check("Phase 5", sentiment_trigger is not None and sentiment_trigger.rule_id == "emotional_shift",
      "emotional_shift fires at delta=0.5")

sentiment_trigger2 = rule_engine.evaluate_sentiment(delta=0.2)
check("Phase 5", sentiment_trigger2 is None,
      "emotional_shift does NOT fire at delta=0.2")

# 5g: sentiment cooldown
rule_engine.reset()
rule_engine.evaluate_sentiment(delta=0.6)  # fires, starts cooldown
sentiment_again = rule_engine.evaluate_sentiment(delta=0.6)  # should be on cooldown
check("Phase 5", sentiment_again is None,
      "emotional_shift cooldown works")

# ============================================================================
# Summary
# ============================================================================

print("\n" + "=" * 60)
print("E2E TEST RESULTS")
print("=" * 60)
total = PASSED + FAILED
print(f"  Passed: {PASSED}/{total}")
if FAILED > 0:
    print(f"  Failed: {FAILED}/{total}")
print(f"\n  Phase 1 (ASR + Diarization):  {'PASS' if FAILED == 0 else 'SEE ABOVE'}")
print(f"  Phase 2 (Trigger Detection):   {'PASS' if FAILED == 0 else 'SEE ABOVE'}")
print(f"  Phase 3 (Prompt Building):     {'PASS' if FAILED == 0 else 'SEE ABOVE'}")
print(f"  Phase 4 (LLM Coach Tip):       {'PASS' if FAILED == 0 else 'SEE ABOVE'}")
print(f"  Phase 5 (Context Triggers):    {'PASS' if FAILED == 0 else 'SEE ABOVE'}")

if FAILED == 0:
    print("\n*** ALL TESTS PASSED ***")
    # Write results JSON for documentation
    results = {
        "pipeline": "FunASR (fsmn-vad + paraformer-zh + cam++)",
        "asr_segments": len(all_segments),
        "asr_speakers": len(speakers),
        "asr_rtf": round(asr_time / duration, 3),
        "asr_duration_s": round(duration, 1),
        "trigger_rules_tested": 5,
        "trigger_context_tested": 3,
        "coach_llm_tested": True,
        "total_checks": total,
        "passed": PASSED,
        "failed": FAILED,
    }
    with open("test_data/coach_e2e_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nResults saved to test_data/coach_e2e_results.json")
else:
    print(f"\n*** {FAILED} TEST(S) FAILED ***")
    sys.exit(1)
