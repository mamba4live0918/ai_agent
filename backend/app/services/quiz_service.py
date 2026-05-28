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

GENERATION_PROMPT = """你是一位资深的教育评估专家。请根据以下知识库内容，生成 {question_count} 道练习题。

{context}

题目要求：
- 题目类型分布：{type_distribution}
- 每道题必须基于上述知识库内容，不能凭空编造
- 选择题：4个选项（A/B/C/D），只有一个正确答案，干扰项要有迷惑性
- 简答题：答案要具体，有明确的评分要点
- 题目难度适中，考察对知识库内容的理解和应用
- 题目之间尽量覆盖不同方面的知识点

**答案解析要求（重要）：**
- 每道题的 explanation 必须详细，至少 3-4 句话
- 选择题：逐项分析为什么选这个答案，说明每个干扰项为什么错误，引用知识库原文作为依据
- 简答题：列出完整的评分要点（至少 3 个），每个要点说明其分值和判断标准，给出满分回答范例
- 所有解析必须引用知识库原文片段作为支撑

请严格按照以下 JSON 数组格式输出，不要输出任何其他内容：

```json
[
  {{
    "type": "choice",
    "stem": "题目题干",
    "options": {{"A": "选项A", "B": "选项B", "C": "选项C", "D": "选项D"}},
    "correct_answer": "A",
    "explanation": "正确答案是A。解析：（1）根据知识库原文'...'，A选项正确反映了...；（2）B选项错误，因为...；（3）C选项与原文'...'矛盾；（4）D选项混淆了...的概念。因此选A。",
    "kb_reference": {{"title": "来源文档名", "preview": "相关原文片段"}}
  }},
  {{
    "type": "short_answer",
    "stem": "题目题干",
    "correct_answer": "参考答案：要点1、要点2、要点3...（完整详细）",
    "explanation": "评分标准：（1）要点1（x分）：需包含...才算正确；（2）要点2（x分）：...；（3）要点3（x分）：...。满分回答范例：...",
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

    # Build search query and retrieve context
    search_query = "销售知识 综合"
    doc_titles: list[str] = []
    doc_filenames: list[str] | None = None

    if document_ids:
        # Document-level: fetch documents from DB, use titles for search
        docs = db_session.query(Document).filter(Document.id.in_(document_ids)).all()
        if docs:
            doc_titles = [d.title for d in docs]
            doc_filenames = [os.path.basename(d.file_path) for d in docs]
            search_query = " ".join(doc_titles)
    elif category_id:
        cat = db_session.query(Category).filter(Category.id == category_id).first()
        if cat:
            search_query = cat.name

    # Retrieve KB context — filter by filenames when specific docs are selected
    context = search_knowledge_base(search_query, user_id=user_id, k=10, filenames=doc_filenames)
    if not context.strip():
        context = "（知识库为空，请基于通用销售知识出题）"

    # Emphasize scope restriction in prompt
    if doc_titles:
        doc_list = "\n".join(f"- {t}" for t in doc_titles)
        context = (
            f"【重要：出题范围严格限定以下文档，不得超出此范围】\n"
            f"{doc_list}\n\n"
            f"以下是上述文档中检索到的相关内容：\n{context}"
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

    prompt = GENERATION_PROMPT.format(
        question_count=question_count,
        context=context,
        type_distribution=type_distribution,
    )

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "你是一位资深的教育评估专家，擅长根据学习材料设计高质量的练习题。你总是严格按照要求的 JSON 格式输出。"},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=4096,
    )

    raw = response.choices[0].message.content or ""
    cleaned = _clean_llm_json(raw)

    try:
        questions = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: try to find JSON array in the text
        m = re.search(r"\[[\s\S]*\]", cleaned)
        if m:
            questions = json.loads(m.group(0))
        else:
            raise ValueError(f"Failed to parse LLM response as JSON: {raw[:500]}")

    if not isinstance(questions, list):
        raise ValueError(f"LLM did not return a JSON array: {raw[:500]}")

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
