"""Sales conversation analysis via LLM — emotion analysis, intent detection, talking point suggestions.

Follows the same pattern as training_service.py: module-level _client singleton,
prompt constants, _extract_json(), search_knowledge_base() for RAG context.
"""

import json
import re
from openai import OpenAI
from ..config import settings
from .rag_service import search_knowledge_base

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)


def _extract_json(content: str) -> dict:
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    if json_match:
        content = json_match.group(1)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw": content, "error": "JSON parse failed"}


EMOTION_ANALYSIS_PROMPT = """你是一位资深销售心理学分析师。请分析以下销售对话录音转录文本中的情感动态。

【对话转录】
{conversation_text}

【知识库参考】
{kb_context}

请以 JSON 格式返回分析结果：
{{
    "overall_sentiment": "positive/neutral/negative",
    "customer_emotions": [
        {{
            "time_range": "时段描述，如 0:00-2:30",
            "emotion": "主要情绪",
            "intensity": 0.8,
            "trigger": "触发原因"
        }}
    ],
    "emotional_turning_points": [
        {{
            "time_range": "时间点",
            "from": "原来情绪",
            "to": "变化后情绪",
            "cause": "变化原因"
        }}
    ],
    "salesperson_energy": {{
        "start": "高/中/低",
        "middle": "高/中/低",
        "end": "高/中/低"
    }},
    "summary": "整体情感分析总结，100字以内"
}}"""


INTENT_DETECTION_PROMPT = """你是一位销售话术分析专家。请分析以下销售对话中客户的真实意图和信号。

【对话转录】
{conversation_text}

【知识库参考】
{kb_context}

请以 JSON 格式返回：
{{
    "customer_intents": [
        {{
            "intent": "意图类型，如：比价/顾虑/购买意向/探索/拒绝/拖延",
            "confidence": 0.9,
            "evidence": "对话中的原文证据",
            "suggested_response": "建议的一线回应话术"
        }}
    ],
    "buying_signals": ["购买信号1", "购买信号2"],
    "risk_signals": ["风险预警1", "风险预警2"],
    "summary": "客户意图综合分析，100字以内"
}}"""


SUGGESTION_PROMPT = """你是一位顶级销售教练。请基于以下销售对话分析，生成具体的销售建议。

【对话转录】
{conversation_text}

【知识库参考】
{kb_context}

请以 JSON 格式返回：
{{
    "missed_opportunities": ["错失的机会点1", "错失的机会点2"],
    "follow_up_actions": [
        {{
            "priority": 1,
            "action": "具体行动描述",
            "reason": "为什么需要这个行动",
            "suggested_script": "建议的沟通话术脚本"
        }}
    ],
    "key_talking_points": ["关键话术要点1", "关键话术要点2"],
    "next_meeting_prep": "下次会面的准备建议，150字以内",
    "summary": "整体销售建议总结，100字以内"
}}"""


def _call_llm(prompt: str, temperature: float = 0.3, max_tokens: int = 4000) -> dict:
    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return _extract_json(response.choices[0].message.content)


def format_conversation_text(segments: list[dict]) -> str:
    """Convert transcribed segments to a readable conversation text for LLM analysis."""
    lines = []
    for seg in segments:
        speaker = seg.get("speaker", "未知")
        start = seg.get("start", 0)
        minutes = int(start // 60)
        seconds = int(start % 60)
        timestamp = f"{minutes}:{seconds:02d}"
        text = seg.get("text", "")
        lines.append(f"[{timestamp}] {speaker}: {text}")
    return "\n".join(lines)


def analyze_emotions(segments: list[dict], user_id: str) -> dict:
    conversation_text = format_conversation_text(segments)
    query = "客户情绪分析 销售心理"
    kb_context = search_knowledge_base(query, user_id=user_id)
    prompt = EMOTION_ANALYSIS_PROMPT.format(
        conversation_text=conversation_text,
        kb_context=kb_context or "无匹配知识库内容",
    )
    return _call_llm(prompt, temperature=0.3)


def detect_intents(segments: list[dict], user_id: str) -> dict:
    conversation_text = format_conversation_text(segments)
    query = "客户意向识别 购买信号 销售技巧"
    kb_context = search_knowledge_base(query, user_id=user_id)
    prompt = INTENT_DETECTION_PROMPT.format(
        conversation_text=conversation_text,
        kb_context=kb_context or "无匹配知识库内容",
    )
    return _call_llm(prompt, temperature=0.3)


def generate_suggestions(segments: list[dict], user_id: str) -> dict:
    conversation_text = format_conversation_text(segments)
    query = "销售话术建议 跟进技巧 客户沟通"
    kb_context = search_knowledge_base(query, user_id=user_id)
    prompt = SUGGESTION_PROMPT.format(
        conversation_text=conversation_text,
        kb_context=kb_context or "无匹配知识库内容",
    )
    return _call_llm(prompt, temperature=0.3)


def analyze_conversation(segments: list[dict], user_id: str) -> dict:
    """Run the full LLM analysis pipeline on transcribed segments."""
    return {
        "emotion_analysis": analyze_emotions(segments, user_id),
        "intent_detection": detect_intents(segments, user_id),
        "suggestions": generate_suggestions(segments, user_id),
    }
