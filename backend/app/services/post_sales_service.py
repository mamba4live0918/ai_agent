import json
import os
import shutil
from datetime import datetime

from ..config import ServiceError, settings
from .rag_service import search_knowledge_base
from .prompt_templates import extract_json as _extract_json, get_deepseek_client
from .realtime_asr import _collapse_cjk_spaces

_client = get_deepseek_client()


# ── FunASR transcription pipeline (lazy-initialized singleton) ──

_funasr_post_model = None

def _get_funasr_post_model():
    """Return a cached FunASR AutoModel with paraformer + VAD + punctuation + speaker."""
    global _funasr_post_model
    if _funasr_post_model is None:
        from funasr import AutoModel
        _funasr_post_model = AutoModel(
            model="paraformer-zh",
            vad_model="fsmn-vad",
            punc_model="ct-punc",
            spk_model="cam++",
            disable_update=True,
        )
    return _funasr_post_model


def transcribe_audio(file_path: str) -> list[dict]:
    """Transcribe audio with FunASR paraformer-zh + VAD + punctuation + speaker diarization.

    Returns list of segments: [{"start": float, "end": float, "text": str, "speaker": str}]
    """
    if not shutil.which("ffmpeg"):
        raise ServiceError("ffmpeg not found — install ffmpeg to enable audio transcription")

    if not os.path.exists(file_path):
        raise ServiceError(f"Audio file not found: {file_path}")

    try:
        model = _get_funasr_post_model()
        result = model.generate(input=file_path)
    except Exception as e:
        raise ServiceError(f"FunASR transcription failed: {e}")

    # Parse FunASR output into standard segment format
    if isinstance(result, list) and len(result) > 0:
        r = result[0]
    elif isinstance(result, dict):
        r = result
    else:
        return [{"start": 0, "end": 0, "text": str(result), "speaker": "未知"}]

    segments = []
    sentence_info = r.get("sentence_info", []) or [] or r.get("sentences", []) or r.get("segments", [])
    if sentence_info:
        # Count total speaking time per speaker for role assignment
        spk_time: dict[int, float] = {}
        for sent in sentence_info:
            sid = sent.get("spk", 0)
            dur = (sent.get("end", 0) - sent.get("start", 0)) / 1000.0
            spk_time[sid] = spk_time.get(sid, 0) + dur

        # Assign roles by total speaking time (most = 销售, second = 客户)
        sorted_spks = sorted(spk_time.keys(), key=lambda s: spk_time[s], reverse=True)
        label_map: dict[int, str] = {}
        if len(sorted_spks) >= 1:
            label_map[sorted_spks[0]] = "销售"
        if len(sorted_spks) >= 2:
            label_map[sorted_spks[1]] = "客户"
        for i, sid in enumerate(sorted_spks[2:], 2):
            label_map[sid] = f"其他{i}"

        for sent in sentence_info:
            spk_id = sent.get("spk", 0)
            speaker = label_map.get(spk_id, "未知")
            raw_text = sent.get("text", "").strip()
            # Collapse CJK spaces from paraformer-zh output
            raw_text = _collapse_cjk_spaces(raw_text)
            segments.append({
                "start": sent.get("start", 0) / 1000.0,
                "end": sent.get("end", 0) / 1000.0,
                "text": raw_text,
                "speaker": speaker,
            })
    else:
        text = r.get("text", "")
        if isinstance(text, list):
            text = " ".join(text)
        text = _collapse_cjk_spaces(text.strip())
        segments = [{"start": 0, "end": 0, "text": text, "speaker": "未知"}]

    return segments


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

    try:
        response = _client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": "You are a senior sales analyst. You generate detailed, actionable post-call analysis reports. Always respond in Chinese with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=15000,
        )
    except Exception as e:
        raise ServiceError(f"DeepSeek API call failed: {e}")

    if not response.choices or not response.choices[0].message:
        raise ServiceError("DeepSeek returned an empty response")

    content = response.choices[0].message.content
    if content is None or content.strip() == "":
        raise ServiceError("DeepSeek returned empty content")

    result = _extract_json(content)
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

    try:
        response = _client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": "You are an AI assistant. Generate concise, accurate summaries in Chinese. Always respond with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=4000,
        )
    except Exception as e:
        raise ServiceError(f"DeepSeek API call failed: {e}")

    if not response.choices or not response.choices[0].message:
        raise ServiceError("DeepSeek returned an empty response")

    content = response.choices[0].message.content
    if content is None or content.strip() == "":
        raise ServiceError("DeepSeek returned empty content")

    return _extract_json(content)
