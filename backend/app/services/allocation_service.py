import json
import re
from openai import OpenAI

from ..config import settings

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

ALLOCATION_PROMPT = """You are a senior wealth management advisor. Generate a comprehensive asset allocation plan for the client.

【Client Profile】
{client_data}

【Available Products】
{products}

Based on the client's risk tolerance, investment experience, wealth scale, and financial goals, generate THREE allocation plans at different risk levels. Each plan must reference specific client details and product characteristics.

Return ONLY valid JSON, no other text. Use this exact structure:

{{
    "total_investable": <estimated investable amount in CNY, integer>,
    "conservative": {{
        "plan_type": "保守型",
        "overall_rationale": "组合逻辑说明(4-6句)：为什么这样配置，如何匹配客户的风险偏好和财务目标",
        "risk_return_profile": "风险收益概要(2-3句)：预期年化收益区间、最大回撤、夏普比率估算",
        "allocations": [
            {{"product_id": "<UUID from products list>", "ratio": 0.xx, "amount": <integer CNY>, "reason": "配置理由(1-2句)"}}
        ]
    }},
    "balanced": {{
        "plan_type": "稳健型",
        "overall_rationale": "...",
        "risk_return_profile": "...",
        "allocations": [...]
    }},
    "aggressive": {{
        "plan_type": "进取型",
        "overall_rationale": "...",
        "risk_return_profile": "...",
        "allocations": [...]
    }}
}}

Rules:
- All ratio values within a plan MUST sum to exactly 1.0
- Each plan MUST allocate at least 3 different products
- No product's risk_level may exceed the client's risk tolerance score by more than 2
- total_investable estimate based on client assets data; default 1,000,000 if unclear
- Each product_id MUST be an exact UUID from the products list
- All text in Chinese
- Be specific — reference the client's actual age, occupation, income, assets, risk preference
- Do NOT fabricate products — only use products from the provided list"""


def generate_allocation_plan(client_data: dict, products: list[dict]) -> dict:
    """Generate three allocation plans based on client profile and available products."""
    client_json = json.dumps(client_data, ensure_ascii=False, indent=2)
    products_json = json.dumps(products, ensure_ascii=False, indent=2)

    prompt = ALLOCATION_PROMPT.format(client_data=client_json, products=products_json)

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "You are a senior wealth management advisor. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=6000,
    )

    content = response.choices[0].message.content
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    if json_match:
        content = json_match.group(1)

    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        result = {"error": "JSON parse failed", "raw": content}

    return result
