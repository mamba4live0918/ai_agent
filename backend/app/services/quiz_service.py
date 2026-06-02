import json
import re
import uuid
from openai import OpenAI

from ..config import settings
from .rag_service import search_knowledge_base

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

GENERATION_PROMPT = """你是一位资深销售培训教练，擅长通过场景化试题评估销售人员对技巧的掌握程度。

请根据以下培训资料，生成 {question_count} 道**销售场景应用题**，用于检测销售人员培训后是否真正掌握了所学技巧。

{context}

**核心出题原则：**
- 你不是在考"记不记得住"，而是在考"会不会用"
- 每道题必须是真实的销售场景，让答题者代入销售角色做判断
- 题目考察的是：话术选择、客户类型判断、应对策略、沟通技巧、DISC性格分析、拒绝处理

**题型要求：**
- 题目类型分布：{type_distribution}
- 选择题：给出一个销售场景 + 4个应对话术/策略选项（A/B/C/D），只有一个最优答案，其他选项要是"看起来有道理但实际不对"的典型错误
- 简答题：给出一个具体销售困境，要求学员写出应对策略和话术
- 题目难度适中、实用性强，贴近一线销售实际工作
- 题目之间覆盖不同类型的销售场景（初次接触、异议处理、价格谈判、促成成交、客户拒绝等）

**选择题出题模板（优先使用）：**
1. 场景应对型："客户说'我回去和老婆商量一下'，根据DISC性格分析，如果这位客户是S型（稳健型），以下哪种回应最有效？"
2. 话术评价型："面对价格异议，以下四段话术中哪一段最符合'先认同再转移'的沟通策略？"
3. 策略判断型："客户连续三次说'太贵了'，以下分析正确的是？"
4. 拒绝分类型："根据培训中的6型拒绝分析，客户说'你们的产品不如XX公司的'属于哪种拒绝类型？应如何处理？"

**简答题出题模板（优先使用）：**
1. 场景应对型："客户是DISC中的D型（支配型），在第一次电话接触时就表现得很强势，要求你直接报最低价。请写出你的应对策略和核心话术（至少3个要点）。"
2. 策略设计型："客户表示'最近资金紧张，过两个月再说'。请用培训中拒绝处理框架，设计一套完整的跟进方案。"

**答案解析要求（重要）：**
- 每道题的 explanation 必须详细，说明为什么这是最优解
- 选择题：逐项分析每个选项，引用培训资料中的方法论作为判断依据，说明最优选项为什么正确、干扰项为什么是常见错误
- 简答题：列出完整评分要点（至少3个），每个要点给出判断标准，提供满分回答范例
- 解析中引用知识库原文作为理论支撑

请严格按照以下 JSON 数组格式输出，不要输出任何其他内容：

```json
[
  {{
    "type": "choice",
    "stem": "题目题干（必须是具体销售场景）",
    "options": {{"A": "选项A", "B": "选项B", "C": "选项C", "D": "选项D"}},
    "correct_answer": "A",
    "explanation": "正确答案是A。逐项分析：（1）A选项正确，因为根据培训中的XX原则...；（2）B是常见错误，很多销售会...但实际上...；（3）C的问题在于...；（4）D忽略了客户的...。",
    "kb_reference": {{"title": "来源文档名", "preview": "相关原文片段"}}
  }},
  {{
    "type": "short_answer",
    "stem": "题目题干（必须是具体销售困境）",
    "correct_answer": "应对策略：\n1. 要点一（具体话术和理由）\n2. 要点二（具体话术和理由）\n3. 要点三（具体话术和理由）",
    "explanation": "评分标准：（1）要点1（3分）：需包含XX策略/话术，体现对客户心理的把握；（2）要点2（3分）：需运用XX方法论；（3）要点3（4分）：需展示完整的沟通闭环。满分范例：...",
    "kb_reference": {{"title": "来源文档名", "preview": "相关原文片段"}}
  }}
]
```"""

GRADING_PROMPT = """你是一位专业的教育评估师。请对学生的简答题答案进行评分。

题目：{stem}
参考答案：{correct_answer}

学生答案：{user_answer}

请从以下维度评估：
- 是否涵盖了参考答案的关键要点
- 理解是否准确，有无明显错误
- 表述是否清晰完整

请严格按照以下 JSON 格式输出，不要输出任何其他内容：

```json
{{
  "is_correct": true或false,
  "score": 0到1之间的分数（0=完全错误，0.5=部分正确，1=完全正确）,
  "feedback": "评语，中文，2-3句话，指出优点和不足"
}}
```"""


def _clean_llm_json(text: str) -> str:
    """Extract JSON from LLM response, stripping markdown fences and think blocks."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    # Strip control characters that break JSON parsing (except \t, \n, \r)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text.strip()


def generate_questions(
    category_id: str | None,
    document_ids: list[str] | None,
    question_count: int,
    question_types: list[str],
    user_id: str,
    db_session,
    type_counts: dict[str, int] | None = None,
) -> tuple[list[dict], str | None, list[str] | None]:
    """Generate quiz questions using RAG + LLM. Returns (questions_list, category_id, document_ids)."""

    import os
    from ..models.knowledge import Category, Document

    # Build search query — focus on sales techniques, scripts, objection handling, DISC
    search_queries = [
        "销售技巧 话术 客户沟通 应对策略",
        "异议处理 价格谈判 促成成交 拒绝应对",
        "DISC性格分析 客户分类 沟通策略",
        "售前准备 客户需求挖掘 资产配置",
    ]
    doc_titles: list[str] = []
    doc_filenames: list[str] | None = None

    if document_ids:
        docs = db_session.query(Document).filter(Document.id.in_(document_ids)).all()
        if docs:
            doc_titles = [d.title for d in docs]
            doc_filenames = [os.path.basename(d.file_path) for d in docs]
    elif category_id:
        cat = db_session.query(Category).filter(Category.id == category_id).first()
        if cat:
            search_queries = [cat.name]

    # Retrieve KB context — multiple queries for broader coverage of sales skills
    all_contexts: list[str] = []
    seen = set()
    for sq in search_queries:
        part = search_knowledge_base(sq, user_id=user_id, k=5, filenames=doc_filenames)
        if part.strip() and part.strip() not in seen:
            seen.add(part.strip())
            all_contexts.append(part.strip())
    context = "\n\n---\n\n".join(all_contexts) if all_contexts else ""
    if not context.strip():
        context = "（知识库为空，请基于通用销售技巧和DISC性格沟通理论出题）"

    # Emphasize scope restriction and skill-assessment purpose in prompt
    if doc_titles:
        doc_list = "\n".join(f"- {t}" for t in doc_titles)
        context = (
            f"【出题范围：以下培训文档】\n"
            f"{doc_list}\n\n"
            f"以下是文档中检索到的销售技巧相关内容：\n{context}"
        )

    # Build type distribution string with specific counts
    type_labels = {"choice": "选择题", "short_answer": "简答题"}
    if type_counts:
        parts = []
        active_types = []
        for t in question_types:
            cnt = type_counts.get(t, 0)
            if cnt > 0:
                parts.append(f"{type_labels.get(t, t)} {cnt} 道")
                active_types.append(t)
        question_types = active_types
        type_distribution = f"请生成{'、'.join(parts)}，共 {question_count} 道题"
    elif len(question_types) == 1:
        type_distribution = f"全部为{type_labels.get(question_types[0], question_types[0])}"
    else:
        type_distribution = f"混合出题，包含{'和'.join(type_labels.get(t, t) for t in question_types)}"

    # For large question sets, add token-saving instruction
    token_hint = ""
    if question_count > 10:
        token_hint = "\n**注意：题目数量较多，每道题的 explanation 控制在 2-3 句话即可，简答题的评分要点 2-3 个即可。优先保证题目质量而非解析长度。**"

    prompt = GENERATION_PROMPT.format(
        question_count=question_count,
        context=context,
        type_distribution=type_distribution,
    ) + token_hint

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "你是一位资深销售培训教练，擅长设计销售场景应用题来检验学员的技能掌握程度。你需要创建真实的销售情境，测试学员能否运用话术、DISC性格分析、拒绝处理等技巧。你总是严格按照要求的 JSON 格式输出。"},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=16384,
    )

    raw = response.choices[0].message.content or ""
    cleaned = _clean_llm_json(raw)

    try:
        questions = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: try to find JSON array in the text
        m = re.search(r"\[[\s\S]*\]", cleaned)
        if m:
            try:
                questions = json.loads(m.group(0))
            except json.JSONDecodeError:
                raise ValueError(f"LLM返回了无效JSON，最后200字符: ...{raw[-200:]}")
        else:
            raise ValueError(f"LLM返回中没有找到JSON数组，最后200字符: ...{raw[-200:]}")

    if not isinstance(questions, list):
        raise ValueError(f"LLM没有返回JSON数组，前500字符: {raw[:500]}")

    # Validate and fill defaults
    result = []
    for i, q in enumerate(questions):
        result.append({
            "question_type": q.get("type", "choice"),
            "stem": q.get("stem", ""),
            "options": q.get("options") if q.get("type") == "choice" else None,
            "correct_answer": str(q.get("correct_answer", "")),
            "explanation": q.get("explanation", ""),
            "kb_reference": q.get("kb_reference"),
            "question_index": i,
        })

    return result, category_id, document_ids


def grade_choice_answer(user_answer: str, correct_answer: str) -> dict:
    """Grade a multiple-choice answer locally."""
    # Normalize and compare
    ua = user_answer.strip().upper().rstrip(".")
    ca = correct_answer.strip().upper().rstrip(".")
    is_correct = ua == ca

    return {
        "is_correct": is_correct,
        "score": 1.0 if is_correct else 0.0,
        "feedback": "回答正确！" if is_correct else f"回答错误。正确答案是 {correct_answer}。",
    }


def grade_short_answer(stem: str, correct_answer: str, user_answer: str) -> dict:
    """Grade a short-answer question using LLM semantic comparison."""
    prompt = GRADING_PROMPT.format(
        stem=stem,
        correct_answer=correct_answer,
        user_answer=user_answer,
    )

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "你是一位专业的教育评估师，严格按照 JSON 格式输出评分结果。"},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=512,
    )

    raw = response.choices[0].message.content or ""
    cleaned = _clean_llm_json(raw)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "is_correct": False,
            "score": 0.5,
            "feedback": "评分解析失败，请人工评阅。",
        }


def complete_session(db_session, quiz_session) -> float:
    """Calculate aggregate score and mark session as completed."""
    from ..models.quiz import QuizAnswer
    from datetime import datetime

    answers = (
        db_session.query(QuizAnswer)
        .join(QuizAnswer.question)
        .filter(QuizAnswer.question.has(session_id=quiz_session.id))
        .all()
    )

    if not answers:
        score = 0.0
    else:
        total = sum(a.score or 0 for a in answers)
        score = round((total / len(answers)) * 100, 1)

    quiz_session.score = score
    quiz_session.status = "completed"
    quiz_session.completed_at = datetime.utcnow()
    db_session.commit()

    return score
