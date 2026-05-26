import json
import os
import re
import subprocess
import shutil
from datetime import datetime
from openai import OpenAI

from opencc import OpenCC

from ..config import settings
from .rag_service import search_knowledge_base

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

_cc = OpenCC("t2s")  # Traditional Chinese → Simplified Chinese


def _extract_json(content: str) -> dict:
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    if json_match:
        content = json_match.group(1)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw": content, "error": "JSON parse failed"}


# ──────────────────────────── Audio Transcription ────────────────────────────

def _run_diarization(wav_path: str) -> dict | None:
    """Run speaker diarization via pyannote.audio. Returns None if unavailable."""
    if not settings.huggingface_token:
        return None
    try:
        import torchaudio
        from pyannote.audio import Pipeline

        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=settings.huggingface_token,
        )
        # Load audio in-memory to avoid torchcodec dependency
        waveform, sample_rate = torchaudio.load(wav_path)
        diarization = pipeline({"waveform": waveform, "sample_rate": sample_rate})

        # Collect speaker segments and total speaking time per speaker
        speaker_time: dict[str, float] = {}
        speaker_segments: list[dict] = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            duration = turn.end - turn.start
            speaker_time[speaker] = speaker_time.get(speaker, 0) + duration
            speaker_segments.append({"start": turn.start, "end": turn.end, "speaker": speaker})

        # Map speaker labels to Chinese roles by speaking time (descending)
        sorted_speakers = sorted(speaker_time.keys(), key=lambda s: speaker_time[s], reverse=True)
        label_map: dict[str, str] = {}
        if len(sorted_speakers) >= 2:
            label_map[sorted_speakers[0]] = "销售"
            label_map[sorted_speakers[1]] = "客户"
            for i, s in enumerate(sorted_speakers[2:], 3):
                label_map[s] = f"其他{i - 2}"
        elif len(sorted_speakers) == 1:
            label_map[sorted_speakers[0]] = "销售"

        # Remap speaker labels
        for seg in speaker_segments:
            seg["speaker"] = label_map.get(seg["speaker"], seg["speaker"])

        return speaker_segments
    except Exception:
        return None


def _align_speakers(whisper_segments: list[dict], diarization: list[dict] | None) -> list[dict]:
    """Align whisper segments with diarization speaker labels."""
    if not diarization:
        for seg in whisper_segments:
            seg["speaker"] = "未知"
        return whisper_segments

    for seg in whisper_segments:
        seg_start = seg["start"]
        seg_end = seg["end"]
        overlap: dict[str, float] = {}
        for d in diarization:
            o_start = max(seg_start, d["start"])
            o_end = min(seg_end, d["end"])
            if o_start < o_end:
                overlap[d["speaker"]] = overlap.get(d["speaker"], 0) + (o_end - o_start)
        if overlap:
            seg["speaker"] = max(overlap, key=overlap.get)
        else:
            seg["speaker"] = "未知"
    return whisper_segments


def transcribe_audio(file_path: str) -> list[dict]:
    """Convert audio to 16kHz mono WAV via ffmpeg, transcribe with faster-whisper,
    and optionally run speaker diarization via pyannote.audio.

    Returns list of segments: [{"start": float, "end": float, "text": str, "speaker": str}]
    """
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg not found — install ffmpeg to enable audio transcription")

    os.makedirs(settings.audio_upload_dir, exist_ok=True)

    wav_path = file_path.rsplit(".", 1)[0] + "_16k.wav"
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", file_path,
            "-ar", "16000", "-ac", "1", "-f", "wav", wav_path,
        ], capture_output=True, check=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"ffmpeg conversion failed: {e.stderr.decode()}") from e

    # Whisper transcription
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel("large-v3", device="cpu", compute_type="int8")
        whisper_segments, _ = model.transcribe(wav_path, beam_size=5)
        segments = [{"start": s.start, "end": s.end, "text": _cc.convert(s.text.strip())} for s in whisper_segments]
    except ImportError:
        raise RuntimeError("faster-whisper not installed — run: pip install faster-whisper")
    except Exception as e:
        raise RuntimeError(f"Transcription failed: {e}") from e

    # Speaker diarization (best-effort)
    diarization = _run_diarization(wav_path)
    return _align_speakers(segments, diarization)


# ──────────────────────────── KB Matching ────────────────────────────

def match_kb_resources(messages: list[dict], user_id: str) -> list[dict]:
    """Search ChromaDB for relevant scripts and cases based on conversation content."""
    conversation_text = " ".join(m.get("content", "") for m in messages[-10:])
    if not conversation_text.strip():
        return []

    kb_context = search_knowledge_base(conversation_text, user_id=user_id, k=5)
    if not kb_context.strip():
        return []

    # Parse the KB context into structured matches
    lines = kb_context.strip().split("\n")
    matches = []
    current = {}
    for line in lines:
        if line.startswith("[Document "):
            if current:
                matches.append(current)
            current = {"title": line.strip("[]").split("]")[0] if "]" in line else line}
        elif current and "Content:" in line:
            current["snippet"] = line.split("Content:", 1)[-1].strip()[:300]
    if current:
        matches.append(current)

    return matches


# ──────────────────────────── Report Generation ────────────────────────────

REPORT_PROMPT = """You are a senior sales analyst reviewing a completed sales call. Generate a comprehensive post-call analysis report in Chinese.

【Customer Profile】
{profile_text}

【Conversation Transcript】
{transcript}

{kb_section}

Generate a complete analysis report. Return ONLY valid JSON:

{{
    "summary": "通话摘要(3-5句中文)：概括本次通话的核心内容、主要成果和整体氛围。基于KB分析的部分用'📚'标识，AI自行判断的部分用'💡 AI分析'标识",
    "sentiment_trajectory": [
        {{"turn": 1, "salesperson": "销售方发言摘要", "customer": "客户方发言摘要", "customer_sentiment": 0.0, "salesperson_sentiment": 0.0}}
    ],
    "key_moments": [
        {{"type": "positive", "turn": 1, "description": "关键时刻描述", "impact": "对后续对话的影响"}}
    ],
    "capability_radar": {{
        "communication": 0.0,
        "need_discovery": 0.0,
        "objection_handling": 0.0,
        "closing_skill": 0.0,
        "professionalism": 0.0
    }},
    "deal_probability": {{
        "level": "高/中/低",
        "percentage": 0,
        "reasoning": "判断依据(2-3句)"
    }},
    "missed_opportunities": [
        {{"turn": 1, "description": "错失的机会", "suggestion": "应对话术建议"}}
    ],
    "strengths": ["做得好的地方1", "做得好的地方2"],
    "improvements": ["需改进的地方1", "需改进的地方2"],
    "overall_score": 0.0
}}

Rules:
- sentiment scores range -1.0 (very negative) to 1.0 (very positive)
- capability_radar scores range 0.0 to 10.0
- key_moments type is one of: "positive", "negative", "critical"
- overall_score range 0.0 to 10.0
- All text in Chinese
- Be specific, reference actual conversation turns
- 【KB优先原则】优先基于KB匹配内容进行分析。KB支撑的分析标注"📚"，KB未覆盖、AI自行判断的内容标注"💡 AI分析"。严禁编造KB中不存在的信息"""


def generate_report(messages: list[dict], customer_profile: dict | None, user_id: str) -> dict:
    """Generate a full post-call analysis report via DeepSeek."""

    # Build transcript
    transcript_lines = []
    for i, m in enumerate(messages):
        role_label = {"salesperson": "销售", "customer": "客户", "system": "系统"}.get(m.get("role", ""), m.get("role", ""))
        transcript_lines.append(f"[轮次{i+1}] {role_label}: {m.get('content', '')}")
    transcript = "\n".join(transcript_lines)

    # Build profile text
    if customer_profile:
        profile_text = json.dumps(customer_profile, ensure_ascii=False, indent=2)
    else:
        profile_text = "无客户档案"

    # KB matching
    kb_matches = match_kb_resources(messages, user_id)
    kb_section = ""
    if kb_matches:
        kb_items = []
        for m in kb_matches:
            kb_items.append(f"- {m.get('title', 'Unknown')}: {m.get('snippet', '')[:200]}")
        kb_section = f"【KB Matches】\n参考以下知识库内容进行分析（基于KB的内容需标注'📚'，KB未覆盖的需标注'💡 AI分析'）:\n" + "\n".join(kb_items)

    prompt = REPORT_PROMPT.format(
        profile_text=profile_text,
        transcript=transcript,
        kb_section=kb_section,
    )

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "You are a senior sales analyst. You generate detailed, actionable post-call analysis reports. Always respond in Chinese with valid JSON."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=15000,
    )

    result = _extract_json(response.choices[0].message.content)
    result["kb_matches"] = kb_matches
    result["generated_at"] = datetime.utcnow().isoformat()

    return result


# ──────────────────────────── Call Summary ────────────────────────────

SUMMARY_PROMPT = """You are an AI assistant. Generate a concise summary of this sales call in Chinese.

【Conversation】
{transcript}

{kb_context}

Return ONLY valid JSON:
{{
    "title": "通话标题(10字以内)",
    "customer_name": "客户名称(如有)",
    "duration_summary": "时长概述",
    "main_topics": ["话题1", "话题2"],
    "outcome": "通话结果(2-3句)",
    "next_steps": "后续建议(2-3句)"
}}

Rules:
- If KB context provides relevant information, incorporate it and mark with "📚"
- Analysis not supported by KB should be marked with "💡 AI分析"
- Do not fabricate information not in the conversation or KB"""


def generate_summary(messages: list[dict], user_id: str = "") -> dict:
    transcript_lines = []
    for m in messages:
        role_label = {"salesperson": "销售", "customer": "客户", "system": "系统"}.get(m.get("role", ""), m.get("role", ""))
        transcript_lines.append(f"{role_label}: {m.get('content', '')}")
    transcript = "\n".join(transcript_lines)

    # KB retrieval
    conversation_text = " ".join(m.get("content", "") for m in messages[-10:])
    kb_context = search_knowledge_base(conversation_text, user_id=user_id) if user_id else ""

    prompt = SUMMARY_PROMPT.format(transcript=transcript or "空对话", kb_context=kb_context)

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "You are an AI assistant. Generate concise, accurate summaries in Chinese. Always respond with valid JSON."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=4000,
    )

    return _extract_json(response.choices[0].message.content)
