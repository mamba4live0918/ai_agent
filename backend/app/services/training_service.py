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


# ──────────────────────────── Briefing (manual persona) ────────────────────────────

BRIEFING_PROMPT = """You are a senior sales coach preparing a briefing for a training simulation.

【Persona — AI Digital Customer】
{persona}

【Training Scenario】
{scenario}

{kb_context}

Generate a pre-training briefing for the salesperson. They are about to face this AI customer in a simulation.
Return ONLY valid JSON:

{{
    "scenario_context": "场景背景描述(3-4句中文)：基于客户画像和场景类型，构建本次训练的模拟情境。说明客户当前状态、会面背景、可能的氛围",
    "key_points": "客户画像要点(4-5句中文)：本次需要特别注意的客户特征、潜在雷区、可利用的信任基础",
    "watch_out": "关键注意点(4-5句中文)：本次对话中容易犯错的地方、应该避免的表达方式、需要把握的分寸"
}}

Rules:
- All text in Chinese
- Be specific — reference concrete persona details (age, occupation, personality, etc.)
- Keep briefing actionable and concise
- Each section type retains its own content"""


def generate_briefing(persona: dict, scenario: str) -> dict:
    scenario_names = {
        "客诉处理": "客户投诉处理",
        "产品讲解": "产品讲解与推荐",
        "异议处理": "客户异议处理",
    }
    scenario_display = scenario_names.get(scenario, scenario)

    persona_text = json.dumps(persona, ensure_ascii=False, indent=2)
    query = f"{scenario_display} {persona.get('occupation', '')} {persona.get('personality', '')} 销售技巧"
    kb_context = search_knowledge_base(query)

    prompt = BRIEFING_PROMPT.format(persona=persona_text, scenario=scenario_display, kb_context=kb_context)

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "system", "content": "Always respond with valid JSON only."}, {"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=2000,
    )
    return _extract_json(response.choices[0].message.content)


# ──────────────────────────── Customer Agent ────────────────────────────

CUSTOMER_AGENT_PROMPT = """You are simulating a real customer in a sales training exercise. You must embody this persona:

【Your Persona】
{persona}

【Scenario Setting】
{scenario_context}

{kb_context}

【Behavior Guidelines】
- Respond naturally like a real customer would — not a robot
- Your cooperation level and attitude should reflect your personality and the scenario
- If you're an impatient executive, be curt and demanding. If you're a cautious retiree, ask many questions.
- Don't make it too easy — real customers have doubts, objections, and emotions
- Don't make it impossibly hard either — stay within the bounds of the persona
- Keep responses concise (1-4 sentences), natural spoken Chinese
- If the conversation has reached a natural conclusion (you've said something like "好的我了解了", "谢谢你", "我没有其他问题了", "我会考虑的"), subtly signal readiness to end

【Conversation History】
{history}

The salesperson just said: "{user_message}"

Return ONLY valid JSON:
{{
    "reply": "你的中文回复(1-4句)",
    "conversation_ending": true/false
}}

conversation_ending = true ONLY when the conversation has naturally concluded from YOUR side."""


def simulate_customer(persona: dict, scenario: str, scenario_context: str, history_text: str, user_message: str) -> dict:
    persona_text = json.dumps(persona, ensure_ascii=False, indent=2)
    query = f"{scenario} {persona.get('occupation', '')} 客户沟通 应对"
    kb_context = search_knowledge_base(query)

    prompt = CUSTOMER_AGENT_PROMPT.format(
        persona=persona_text,
        scenario_context=scenario_context,
        kb_context=kb_context,
        history=history_text,
        user_message=user_message,
    )

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "system", "content": "You are a real customer in a sales simulation. Always respond with valid JSON only."}, {"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=1000,
    )
    return _extract_json(response.choices[0].message.content)


# ──────────────────────────── Coach Agent ────────────────────────────

COACH_AGENT_PROMPT = """You are a senior sales coach observing a live training simulation. Analyze the salesperson's latest response in context.

【Training Scenario】
{scenario}

【AI Customer Persona】
{persona}

{kb_context}

【Conversation History】
{history}

【Salesperson's Latest Message】
"{user_message}"

【Customer's Response】
"{customer_reply}"

Analyze the salesperson's performance on this turn and provide 4 types of coaching tips. Return ONLY valid JSON:

{{
    "strategy": "策略建议(1-2句中文)：这轮对话的策略层面分析——是否抓住了重点、有什么可以调整的方向",
    "phrasing": "话术矫正(1-2句中文)：具体话术层面的建议——用词是否得当、有没有更好的表达方式",
    "golden_quote": "销售金句(1句中文)：针对当前情境的一个优秀回应范例，可作为参考",
    "emotion": "情绪感知(1句中文)：当前客户可能的情绪状态，以及销售人员应保持的心态"
}}

Rules:
- Be specific to what just happened — don't give generic advice
- Reference actual phrases used when possible
- Keep each tip concise and immediately actionable
- All text in Chinese"""


def simulate_coach(persona: dict, scenario: str, history_text: str, user_message: str, customer_reply: str) -> dict:
    persona_text = json.dumps(persona, ensure_ascii=False, indent=2)
    query = f"{scenario} 销售技巧 话术 应对策略"
    kb_context = search_knowledge_base(query)

    prompt = COACH_AGENT_PROMPT.format(
        scenario=scenario,
        persona=persona_text,
        kb_context=kb_context,
        history=history_text,
        user_message=user_message,
        customer_reply=customer_reply,
    )

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "system", "content": "You are a senior sales coach. Always respond with valid JSON only."}, {"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1500,
    )
    return _extract_json(response.choices[0].message.content)


# ──────────────────────────── Quick Reply Suggestions ────────────────────────────

QUICK_REPLY_PROMPT = """You are a sales coach helping a trainee who is stuck. The salesperson hasn't responded in a while.

【Customer Persona】
{persona}

【Scenario】
{scenario}

【Recent Conversation】
{history}

The customer's last message was: "{last_customer_message}"

The salesperson is stuck and needs quick direction ideas. Generate 2-3 possible reply directions (NOT full scripts — just the direction/angle to take).

Return ONLY valid JSON:
{{
    "suggestions": [
        "方向1：简短的一句话描述回复思路",
        "方向2：简短的一句话描述回复思路",
        "方向3：简短的一句话描述回复思路"
    ]
}}

Keep each suggestion under 30 characters. They should be different strategic angles."""


def generate_quick_replies(persona: dict, scenario: str, history_text: str, last_customer_message: str) -> dict:
    query = f"{scenario} 销售话术 快速应对"
    kb_context = search_knowledge_base(query)

    prompt = QUICK_REPLY_PROMPT.format(
        persona=json.dumps(persona, ensure_ascii=False, indent=2),
        scenario=scenario,
        history=history_text,
        last_customer_message=last_customer_message,
    )

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "system", "content": "Always respond with valid JSON only."}, {"role": "user", "content": prompt}],
        temperature=0.5,
        max_tokens=500,
    )
    return _extract_json(response.choices[0].message.content)


# ──────────────────────────── Review Generation ────────────────────────────

REVIEW_PROMPT = """You are a senior sales coach conducting a thorough post-training review.

【Customer Persona】
{persona}

【Scenario】
{scenario}

{kb_context}

【Full Conversation History】
{full_history}

Analyze the ENTIRE conversation and produce a comprehensive review. Return ONLY valid JSON:

{{
    "scores": {{
        "expression_logic": 1-10整数,
        "professional_accuracy": 1-10整数,
        "emotional_eq": 1-10整数,
        "overall": 1-10整数
    }},
    "dimension_scores": {{
        "logic": 1-10整数,
        "professionalism": 1-10整数,
        "eq": 1-10整数,
        "flexibility": 1-10整数,
        "product_knowledge": 1-10整数,
        "customer_insight": 1-10整数
    }},
    "overall_comment": "教练总评(6-10句中文)：综合评价本次训练表现，指出最大的亮点和最需要改进的地方，给出具体的提升方向",
    "weakness_analysis": [
        {{"skill": "技能名称", "level": "弱/待提升/一般/强", "suggestion": "提升建议(1-2句)"}}
    ],
    "highlights": [
        {{"type": "good", "message_content": "表现好的回复内容(原文引用)", "comment": "为什么好(1句)"}},
        {{"type": "bad", "message_content": "需要改进的回复内容(原文引用)", "comment": "为什么不好(1句)", "improved_version": "改进版话术(1-2句)"}}
    ],
    "next_steps": [
        {{"priority": 1-3整数, "action": "具体行动建议(1-2句)"}}
    ]
}}

Rules:
- All text in Chinese
- Be honest and constructive — not just praise
- Specific examples from the conversation are essential for highlights
- Dimension scores should be evidence-based
- Weakness analysis must include actionable improvement suggestions"""


def generate_review(persona: dict, scenario: str, full_history: str) -> dict:
    persona_text = json.dumps(persona, ensure_ascii=False, indent=2)
    query = f"{scenario} 销售评分标准 话术范例 复盘"
    kb_context = search_knowledge_base(query)

    prompt = REVIEW_PROMPT.format(
        persona=persona_text,
        scenario=scenario,
        kb_context=kb_context,
        full_history=full_history,
    )

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "system", "content": "You are a senior sales coach. Always respond with valid JSON only."}, {"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=4000,
    )
    return _extract_json(response.choices[0].message.content)
