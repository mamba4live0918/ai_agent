import json
import re
from openai import OpenAI

from ..config import settings
from .rag_service import search_knowledge_base
from .web_search_service import web_search_finance

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

ALLOCATION_PROMPT = """You are a senior wealth management advisor. Generate a comprehensive asset allocation plan for the client.

【Client Profile】
{client_data}

【Available Products】
{products}

{kb_context}

{web_context}

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
        "plan_type": "激进型",
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
- Do NOT fabricate products — only use products from the provided list
- 【KB优先原则】有知识库匹配内容时，优先参考KB中的配置思路和产品建议。KB支撑的方案逻辑标注"📚"，KB未覆盖、AI自行设计的标注"💡AI分析" """


def generate_allocation_plan(client_data: dict, products: list[dict], user_id: str) -> dict:
    """Generate three allocation plans based on client profile and available products."""
    client_json = json.dumps(client_data, ensure_ascii=False, indent=2)
    products_json = json.dumps(products, ensure_ascii=False, indent=2)

    # Build search query from client profile and product types
    sd = client_data.get("structured_data") or {}
    ap = client_data.get("ai_profile") or {}
    search_parts = [
        sd.get("risk_preference", ""),
        sd.get("goals", ""),
        sd.get("assets", ""),
        ap.get("product_recommendations", ""),
    ]
    product_types = list({p.get("type", "") for p in products if p.get("type")})
    search_query = " ".join(v for v in search_parts if v and v != "未知") + " " + " ".join(product_types)
    search_query = search_query.strip() or "资产配置 理财产品推荐"
    kb_context = search_knowledge_base(search_query, user_id=user_id)
    web_context = web_search_finance(search_query)

    prompt = ALLOCATION_PROMPT.format(client_data=client_json, products=products_json, kb_context=kb_context, web_context=web_context)

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "You are a senior wealth management advisor. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=8000,
    )

    content = response.choices[0].message.content
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    if json_match:
        content = json_match.group(1)

    # Remove BOM and control characters that break JSON
    content = content.replace("﻿", "")

    try:
        result = json.loads(content)
    except json.JSONDecodeError as e:
        # Try to repair truncated JSON
        if "Unterminated string" in str(e) or "Expecting" in str(e) or "end of file" in str(e):
            # Strip the unterminated line and close all open structures
            lines = content.split("\n")
            # Remove the last line (the one with unterminated string)
            repaired = "\n".join(lines[:-1]).rstrip().rstrip(",")
            # Close remaining open allocations array and plan objects
            # Count current brace/bracket depth
            depth_brackets = repaired.count("[") - repaired.count("]")
            depth_braces = repaired.count("{") - repaired.count("}")
            repaired += "]" * depth_brackets + "}" * depth_braces
            try:
                result = json.loads(repaired)
            except json.JSONDecodeError:
                result = {"error": "JSON parse failed (truncated)", "raw": content}
        else:
            result = {"error": "JSON parse failed", "raw": content}

    return result
