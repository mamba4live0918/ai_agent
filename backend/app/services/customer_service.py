import json
import re
from openai import OpenAI

from ..config import settings

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

ANALYSIS_PROMPT = """You are a professional customer analyst for financial sales. Your analysis must be thorough, data-driven, and actionable.

Customer description:
{raw_text}

Return ONLY valid JSON, no other text. **CRITICAL: You MUST include the "scores" field with all 6 dimensions. Each dimension MUST have a "value" (integer 1-10) and "reasoning" (string). This is mandatory — do NOT omit the scores.**

Use this exact structure:

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
    "scores": {{
        "wealth_scale": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "risk_tolerance": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "investment_experience": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "need_urgency": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "customer_potential": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "communication_difficulty": {{"value": 1-10, "reasoning": "一句评分依据"}}
    }},
    "ai_profile": {{
        "persona_summary": "客户画像总结(4-6句，涵盖身份、性格、财务特征、核心关注点、潜在需求和合作可能性)",
        "financial_needs_analysis": "财务需求深度分析(4-6句，从资产配置、税务规划、传承安排、现金流管理等多角度剖析，指出当前理财方案的不足与机会)",
        "communication_suggestions": "沟通策略与话术建议(4-6句，包括开场切入点、建立信任的方法、关键话题引导、应避免的表达方式、促成技巧)",
        "risk_warnings": "风险揭示与合规提示(4-6句，涵盖投资风险、法律风险、家庭风险、市场风险、以及合规销售注意事项)",
        "product_recommendations": "产品配置建议(4-6句，列出具体产品类型及推荐理由，说明与客户需求的匹配度，分主次优先级)",
        "next_steps": "详细跟进计划(4-6句，分阶段列出近期/中期/远期行动步骤，包括需要准备的资料、需要协调的团队资源)"
    }}
}}

## Scoring Rubric (MUST apply strictly based on customer's stated facts):

wealth_scale (财富规模):
  1-3: 年收入<20万，无房产或资产
  4-6: 年收入20-100万，1套房产，有少量可投资资产
  7-8: 年收入100-500万，多套房产，有大额可投资资产
  9-10: 年收入>500万，多套房产+企业股权/家族资产等

risk_tolerance (风险承受力):
  1-3: 明确表示"保本""不能亏""不接受亏损"
  4-6: 偏保守，买过银行理财/债券基金，可以接受小幅波动
  7-8: 理性接受波动，买过股票基金，理解风险收益正比
  9-10: 追求高收益，做过股票/期货/PE等高风险投资

investment_experience (投资经验):
  1-3: 只存定期/买过银行理财，不关注市场
  4-6: 买过基金，了解基本投资概念，有一定持有经验
  7-8: 配置多种产品类型，3年以上投资经历，有独立判断能力
  9-10: 经验丰富，涉及股票/期货/外汇/PE等多种工具，熟悉市场

need_urgency (需求紧迫度):
  1-3: 随便了解，无明确时间表，无具体需求
  4-6: 有明确咨询方向，但未进入决策阶段
  7-8: 已比较多家产品/方案，近期（1-3个月）有意向决策
  9-10: 急需解决方案，已主动多次联系，准备立即行动

customer_potential (客户潜力):
  1-3: 单次小额需求，后续无明确可挖掘空间
  4-6: 有长期理财需求，可逐步深化合作
  7-8: 高净值客户，多个需求方向可交叉销售
  9-10: 超高净值，可建立长期深度合作关系，有转介绍价值

communication_difficulty (沟通难度):
  1-3: 已有信任基础，沟通无障碍，客户主动配合
  4-6: 正常商业沟通，需要通过专业能力逐步建立信任
  7-8: 有一定顾虑或误解，需要花费精力打消疑虑、澄清认知
  9-10: 高度防备或抵触，需要长期破冰和多方佐证

Rules:
- For missing info, use null or "未知"
- Keep all text in Chinese
- Base analysis ONLY on provided information, do NOT fabricate details
- All 6 ai_profile sections MUST be 4-6 sentences each, providing depth and specificity
- Every score MUST have a reasoning field explaining the basis for the rating
- If a dimension cannot be scored from available info, fill with a moderate value (4-6) and note "信息不足，基于有限信息推断" in reasoning"""


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
