import json
import re
from openai import OpenAI

from ..config import settings

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

ANALYSIS_PROMPT = """You are a professional customer analyst for financial sales.

Analyze the following customer description and extract structured information. Return ONLY valid JSON, no other text.

Customer description:
{raw_text}

Return JSON with these fields:
{{
    "name": "客户姓名",
    "structured_data": {{
        "age": 年龄数字或null,
        "gender": "男/女/未知",
        "occupation": "职业",
        "income_level": "收入水平描述",
        "assets": "资产状况描述",
        "risk_preference": "风险偏好(保守/稳健/进取)",
        "investment_experience": "投资经验描述",
        "family_status": "家庭状况",
        "goals": "理财目标"
    }},
    "ai_profile": {{
        "persona_summary": "客户画像一句话总结",
        "financial_needs_analysis": "财务需求分析(2-3句)",
        "communication_suggestions": "沟通建议(2-3句)",
        "risk_warnings": "风险提示(2-3句)",
        "product_recommendations": "适合的产品类型建议",
        "next_steps": "下一步跟进建议"
    }}
}}

Rules:
- For missing info, use null or "未知"
- Keep all text in Chinese
- Base analysis only on provided information, do not fabricate details"""


def analyze_customer(raw_text: str) -> dict:
    prompt = ANALYSIS_PROMPT.format(raw_text=raw_text)

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "You are a financial customer analyst. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=4000,
    )

    content = response.choices[0].message.content
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    # Extract JSON from response (handle markdown code blocks)
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    if json_match:
        content = json_match.group(1)

    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        result = {
            "name": "未知",
            "structured_data": {},
            "ai_profile": {"persona_summary": content, "error": "JSON parse failed, raw response returned"},
        }

    return result
