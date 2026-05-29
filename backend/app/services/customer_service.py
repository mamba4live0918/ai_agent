import json
import re
from openai import OpenAI

from ..config import settings
from .rag_service import search_knowledge_base

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

ANALYSIS_PROMPT = """You are a professional customer analyst for financial sales across all banking scenarios: retail, corporate, wealth management, credit, and insurance. You must classify each customer using the DISC personality framework and practical frontline types.

## Customer Personality Classification Reference

### DISC Model (Professional - banking standard)
- **D (Dominant/掌控型)**: strong-willed, goal-oriented, values efficiency. Business owners, HNW males, executives. Fast speech, blunt, skips small talk. Focus on returns, speed, advantages. Suits: business loans, large CDs, corporate banking.
- **I (Influential/社交型)**: warm, extroverted, emotion-driven. White-collar, social, middle-aged women. Chats freely, asks about others. Focus on service, relationships, testimonials. Suits: wealth mgmt, insurance, credit cards.
- **S (Steady/稳健型)**: gentle, risk-averse, cautious. LARGEST branch segment. Middle-aged/elderly, working families. Speaks little, never decides on spot ("consult family"). Focus on safety, stability. Suits: deposits, bonds, low-risk products.
- **C (Conscientious/严谨型)**: rational, detail-oriented, skeptical. Civil servants, finance pros, highly educated. Questions everything, takes notes, compares. Focus on compliance, data, risk logic. Suits: complex products, trusts, portfolio allocation.

### Practical Frontline Types
1. 干脆果断型 2. 沉默寡言型 3. 健谈外向型 4. 多疑戒备型 5. 犹豫摇摆型 6. 重情认人型 7. 逐利精明型 8. 完美挑剔型

### Financial Attribute Types (investment mindset)
极致保守型 / 稳健平衡型 / 进取灵活型 / 冲动冒险型 / 佛系观望型

### Personality Identification (5 communication stages)
1. Opening: skips chat=D / chats freely=I / polite silence=S / immediate skepticism=多疑型
2. Questions: only returns/process=D / scattered+stories=I / safety repetition=S / technical details=C
3. Body language: lean forward=S / relaxed distracted=I / arms crossed noting=C / fidgeting=D
4. Risk reaction: insists own view=D / excited by peers=I / backs off at "risk"=S / challenges every point=C
5. Decision: on the spot=D / defers to family=S / takes all materials to research=C

NOTE: Most customers are mixed types. Identify the DOMINANT type. Include both DISC and practical classification.

Customer description:
{raw_text}

{kb_context}

{manual_context}

Return ONLY valid JSON, no other text. **CRITICAL: You MUST include the "scores" field with all 6 dimensions. Each dimension MUST have a "value" (integer 1-10) and "reasoning" (string). This is mandatory — do NOT omit the scores.**

Use this exact structure:

{{
    "name": "客户姓名",
    "structured_data": {{
        "age": 年龄数字或null,
        "gender": "男/女/未知",
        "occupation": "职业",
        "position": "职务/职位",
        "education": "学历(高中及以下/大专/本科/硕士/博士/未知)",
        "address": "家庭住址或区域(未知则填null)",
        "contact": "联系方式(未知则填null)",
        "marital_status": "婚姻状况(已婚/未婚/离异/未知)",
        "family_members": "家庭成员简述(子女数量/老人情况/同住人员等，未知则填null)",
        "industry": "所在行业",
        "company_type": "单位性质(国企/民企/外企/事业单位/个体/未知)",
        "social_circle": "社交圈层简述(未知则填null)",
        "main_income": "主业收入描述",
        "side_income": "副业/投资收益描述(无则填null)",
        "income_stability": "收入稳定性(稳定/较稳定/不稳定/未知)",
        "annual_income_range": "年收入区间(如20-50万/50-100万/100万+/未知)",
        "deposit_amount": "活期+定期存款规模简述",
        "wealth_management": "理财产品持有情况简述(无则填null)",
        "fund_stock": "基金+股票持有情况简述(无则填null)",
        "real_estate": "房产情况(套数/估值/贷款，未知则填null)",
        "vehicle": "车辆情况(品牌/估值，无则填null)",
        "other_assets": "贵金属/保险/股权等其他资产(无则填null)",
        "total_asset_range": "总资产区间(如100-500万/500-1000万/1000万+/未知)",
        "housing_loan": "房贷情况(月供/余额，无则填null)",
        "car_loan": "车贷情况(月供/余额，无则填null)",
        "business_loan": "经营贷情况(无则填null)",
        "credit_card_debt": "信用卡负债(无则填null)",
        "other_debt": "其他欠款(无则填null)",
        "monthly_debt_payment": "月还款总额(无则填null)",
        "available_funds": "闲置可投资资金规模简述",
        "single_investment_cap": "单笔可投金额区间",
        "fund_usage_period": "资金使用周期(短期3月内/中期3月-2年/长期2年以上/混合)",
        "fund_purpose": "资金用途(日常周转/子女教育/养老/购房/购车/婚嫁/创业/旅游/医疗备用等，可多选)",
        "liquidity_need": "赎回灵活性要求(高/中/低/无特别要求)",
        "rigid_cash_time": "有无刚性用钱时间节点(有则描述，无则填null)",
        "risk_preference": "风险偏好(保守型/稳健型/平衡型/进取型)",
        "investment_years": "投资年限",
        "past_products": "过往接触过的产品类型",
        "past_pnl_experience": "过往盈亏体验(盈利/亏损/持平/无经验)",
        "investment_style": "投资偏好(固收类/权益类/混合类/外币类/另类/无偏好)",
        "term_preference": "期限偏好(短期/长期/灵活/无偏好)",
        "core_concern": "核心关注(保本/收益/流动性/省心/资产增值，可多选)",
        "social_insurance": "社保/医保情况(有/无/未知)",
        "commercial_insurance": "商业保险简述(重疾/医疗/寿险/年金/意外险种类+保额，无则填null)",
        "insurance_gap": "保障缺口(担心大病/意外/养老/传承等风险，无则填null)",
        "insurance_preference": "投保意向(消费型/返还型/年金类/无，关注自身还是家人)",
        "lifestyle": "消费习惯+兴趣爱好+近期计划简述(未知则填null)",
        "pain_points": "金融痛点(对现有产品不满/理财困惑/资金打理难题，无则填null)",
        "cooperation_intent": "长期合作意向(高/中/低/未知)",
        "referral_willingness": "转介绍意愿(高/中/低/未知)",
        "service_preference": "服务偏好(线上/线下面谈/均可/未知)",
        "communication_frequency": "沟通频率要求(高频/定期/仅需时联系/未知)",
        "kyc_notes": "补充说明(KYC重点关注事项或其它未覆盖信息，无则填null)"
    }},
    "scores": {{
        "wealth_scale": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "risk_tolerance": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "investment_experience": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "need_urgency": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "customer_potential": {{"value": 1-10, "reasoning": "一句评分依据"}},
        "communication_difficulty": {{"value": 1-10, "reasoning": "一句评分依据"}}
    }},
    "personality_profile": {{
        "disc_type": "D/I/S/C（主要性格类型）",
        "disc_secondary": "D/I/S/C（次要性格类型，纯单一类型填null）",
        "practical_type": "干脆果断型/沉默寡言型/健谈外向型/多疑戒备型/犹豫摇摆型/重情认人型/逐利精明型/完美挑剔型",
        "financial_type": "极致保守型/稳健平衡型/进取灵活型/冲动冒险型/佛系观望型",
        "personality_summary": "性格综合分析(3-4句)：基于DISC模型判断依据、典型行为特征、对该客户的核心沟通策略方向"
    }},
    "ai_profile": {{
        "persona_summary": "客户画像总结(4-6句，涵盖身份、DISC性格类型、财务特征、核心关注点、潜在需求和合作可能性)",
        "financial_needs_analysis": "财务需求深度分析(4-6句，从资产配置、税务规划、传承安排、现金流管理等多角度剖析，指出当前理财方案的不足与机会)",
        "communication_suggestions": "沟通策略与话术建议(4-6句)：基于DISC性格定制策略——D型给选择权不过多干预、I型先拉近关系再用案例带动、S型先讲安全建立信任、C型用数据和条款说话。包括开场切入点、关键话题引导、应避免的表达方式、促成技巧",
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
- If a dimension cannot be scored from available info, fill with a moderate value (4-6) and note "信息不足，基于有限信息推断" in reasoning
- 【KB优先原则】优先基于知识库匹配内容进行分析。KB支撑的分析在reasoning中标注"📚基于知识库"，KB未覆盖、AI自行推断的在reasoning中标注"💡AI分析" """


def analyze_customer(raw_text: str, user_id: str, edited_structured_data: dict | None = None) -> dict:
    kb_context = search_knowledge_base(raw_text, user_id=user_id)

    # Build manual context from edited structured_data
    manual_context = ""
    if edited_structured_data:
        parts = []
        for key, label in [
            ("age", "年龄"), ("gender", "性别"), ("occupation", "职业"),
            ("position", "职务"), ("education", "学历"), ("address", "住址"),
            ("marital_status", "婚姻状况"), ("family_members", "家庭成员"),
            ("industry", "行业"), ("company_type", "单位性质"), ("social_circle", "社交圈层"),
            ("main_income", "主业收入"), ("side_income", "副业收入"),
            ("income_stability", "收入稳定性"), ("annual_income_range", "年收入区间"),
            ("deposit_amount", "存款规模"), ("wealth_management", "理财产品"),
            ("fund_stock", "基金股票"), ("real_estate", "房产"), ("vehicle", "车辆"),
            ("other_assets", "其他资产"), ("total_asset_range", "总资产区间"),
            ("housing_loan", "房贷"), ("car_loan", "车贷"), ("business_loan", "经营贷"),
            ("credit_card_debt", "信用卡负债"), ("other_debt", "其他负债"),
            ("monthly_debt_payment", "月还款额"), ("available_funds", "可投资资金"),
            ("single_investment_cap", "单笔投资上限"),
            ("fund_usage_period", "资金使用周期"), ("fund_purpose", "资金用途"),
            ("liquidity_need", "赎回灵活性"), ("rigid_cash_time", "刚性用钱时间点"),
            ("risk_preference", "风险偏好"), ("investment_years", "投资年限"),
            ("past_products", "过往产品"), ("past_pnl_experience", "过往盈亏体验"),
            ("investment_style", "投资偏好"), ("term_preference", "期限偏好"),
            ("core_concern", "核心关注"), ("social_insurance", "社保医保"),
            ("commercial_insurance", "商业保险"), ("insurance_gap", "保障缺口"),
            ("insurance_preference", "投保意向"), ("lifestyle", "生活近况"),
            ("pain_points", "金融痛点"), ("cooperation_intent", "合作意向"),
            ("referral_willingness", "转介绍意愿"),
            ("service_preference", "服务偏好"), ("communication_frequency", "沟通频率"),
            ("kyc_notes", "KYC备注"),
        ]:
            val = edited_structured_data.get(key)
            if val and val != "未知" and val != "":
                parts.append(f"- {label}：{val}")
        if parts:
            manual_context = "\n".join([
                "",
                "【人工补充信息（最高优先级）】",
                "以下信息来自销售人员手动填写，请严格采用这些数据，不要用 AI 重新推断或覆盖：",
                *parts,
                "对于未列出的字段，继续从原始客户描述中提取。",
            ])

    prompt = ANALYSIS_PROMPT.format(raw_text=raw_text, kb_context=kb_context, manual_context=manual_context)

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


PRESALES_PREP_PROMPT = """You are a senior sales coach preparing a financial salesperson for an upcoming client engagement.

You have the following comprehensive client analysis to work with:

【Client Structured Data】
{structured_data}

【Personality Profile (DISC + Practical Types)】
{personality_profile}

【AI Profile Analysis】
{ai_profile}

【Dimensional Scores (1-10)】
{scores}

{kb_context}

Based on ALL the above information, generate a comprehensive pre-sales preparation report. Return ONLY valid JSON, no other text. Use this exact structure:

{{
    "lifecycle_analysis": "客户生命周期阶段分析(4-6句)：判断客户当前处于哪个销售阶段（关系建立期/需求挖掘期/方案推荐期/促成成交期/售后维护期/深度开发期），说明判断依据，描述该阶段的关键特征和销售重点",
    "potential_difficulties": "潜在难点与客户顾虑(4-6句)：结合DISC性格类型预判阻力——D型反感啰嗦/I型容易走神/S型恐惧风险犹豫不决/C型纠结细节质疑条款。每一条结合客户具体情况",
    "response_scripts": "应对话术(4-6句)：DISC定制化话术——D型直接讲核心给选择权、I型先寒暄用案例带动、S型先讲安全表达理解给时间、C型先展示数据条款欢迎提问。语言自然真实",
    "mindset_preparation": "销售人员心态准备(4-6句)：针对DISC特定性格的沟通陷阱——对D型忌啰嗦、对I型忌太严肃、对S型忌急于成交施压、对C型忌含糊其辞夸海口。如何平衡专业性和亲和力？",
    "maintenance_actions": "维护动作与跟进节奏(4-6句)：DISC定制跟进——D型简洁高效定期推送/I型保持互动节日问候/S型持续关怀定期回访/C型定期发送专业资讯市场分析。分阶段行动计划"
}}

## DISC Communication Quick Reference
- D型客户: 简洁直接，给选项不替ta决定。聚焦收益/效率/竞争力。忌：啰嗦铺垫、替客户做主。
- I型客户: 先拉近关系，用故事/案例/口碑带动。保持热情互动。忌：太严肃、数据轰炸、冷落客户。
- S型客户: 从安全讲起，耐心温和不施压。给予充分时间，主动提供资料供家人商议。忌：急于成交、制造紧迫感。
- C型客户: 用数据和条款说话，展现专业性。逐条讲解，欢迎提问。忌：含糊其辞、夸大收益、回避细节。

Rules:
- All text in Chinese
- Each section MUST be 4-6 sentences, specific and actionable
- Explicitly reference the client's DISC type and tailor advice accordingly
- Do NOT give generic advice — every suggestion must fit THIS specific client
- For response_scripts, include actual phrases the salesperson can say
- 【KB优先原则】有知识库匹配内容时优先基于KB分析。KB支撑的建议标注"📚"，KB未覆盖、AI自行判断的标注"💡AI分析"。严禁编造KB中不存在的信息"""


def generate_presales_prep(customer_data: dict, user_id: str) -> dict:
    """Generate a pre-sales preparation report based on existing customer analysis."""
    structured_data = json.dumps(customer_data.get("structured_data") or {}, ensure_ascii=False, indent=2)
    personality_profile = json.dumps(customer_data.get("personality_profile") or {}, ensure_ascii=False, indent=2)
    ai_profile = json.dumps(customer_data.get("ai_profile") or {}, ensure_ascii=False, indent=2)
    scores = json.dumps(customer_data.get("scores") or {}, ensure_ascii=False, indent=2)

    # Build search query from key customer fields
    sd = customer_data.get("structured_data") or {}
    search_parts = [
        sd.get("occupation", ""),
        sd.get("risk_preference", ""),
        sd.get("goals", ""),
        sd.get("investment_experience", ""),
    ]
    search_query = " ".join(v for v in search_parts if v and v != "未知") or "销售话术 客户沟通"
    kb_context = search_knowledge_base(search_query, user_id=user_id)

    prompt = PRESALES_PREP_PROMPT.format(
        structured_data=structured_data,
        personality_profile=personality_profile,
        ai_profile=ai_profile,
        scores=scores,
        kb_context=kb_context,
    )

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "You are a senior sales coach. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=4000,
    )

    content = response.choices[0].message.content
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    if json_match:
        content = json_match.group(1)

    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        result = {
            "lifecycle_analysis": content,
            "potential_difficulties": "JSON解析失败",
            "response_scripts": "JSON解析失败",
            "mindset_preparation": "JSON解析失败",
            "maintenance_actions": "JSON解析失败",
            "error": "JSON parse failed, raw response returned",
        }

    return result
