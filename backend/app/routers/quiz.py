import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.quiz import QuizSession, QuizQuestion, QuizAnswer
from ..database import get_db
from ..utils.auth import get_current_user, apply_user_filter
from ..schemas.quiz import (
    QuizGenerateRequest,
    QuizAnswerRequest,
    QuizAnswerResponse,
    QuizQuestionResponse,
    QuizSessionResponse,
    QuizSessionListItem,
)
from ..services import quiz_service

router = APIRouter()


def _question_to_response(q: QuizQuestion, hide_answer: bool = True) -> QuizQuestionResponse:
    return QuizQuestionResponse(
        id=str(q.id),
        question_type=q.question_type,
        stem=q.stem,
        options=q.options,
        correct_answer=None if hide_answer else q.correct_answer,
        explanation=q.explanation if not hide_answer else None,
        kb_reference=q.kb_reference,
        question_index=q.question_index,
        answer=QuizAnswerResponse(
            id=str(q.answer.id),
            question_id=str(q.answer.question_id),
            user_answer=q.answer.user_answer,
            is_correct=q.answer.is_correct,
            score=q.answer.score,
            feedback=q.answer.feedback,
            created_at=q.answer.created_at.isoformat(),
        ) if q.answer else None,
    )


@router.post("/sessions", response_model=QuizSessionResponse)
def create_quiz_session(
    req: QuizGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if req.question_count < 1 or req.question_count > 20:
        raise HTTPException(status_code=400, detail="题目数量需在 1-20 之间")
    if not req.question_types:
        raise HTTPException(status_code=400, detail="至少选择一种题目类型")
    for t in req.question_types:
        if t not in ("choice", "short_answer"):
            raise HTTPException(status_code=400, detail=f"不支持的题目类型: {t}")

    # Generate questions via LLM
    category_id = uuid.UUID(req.category_id) if req.category_id else None

    try:
        questions_data, _, doc_ids = quiz_service.generate_questions(
            category_id=category_id,
            document_ids=req.document_ids,
            question_count=req.question_count,
            question_types=req.question_types,
            user_id=str(current_user.id),
            db_session=db,
            type_counts=req.type_counts,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"题目生成失败: {str(e)}")

    # Create session
    session = QuizSession(
        user_id=current_user.id,
        category_id=category_id,
        document_ids=doc_ids if doc_ids else None,
        question_count=len(questions_data),
        status="active",
    )
    db.add(session)
    db.flush()

    # Create questions
    for qd in questions_data:
        question = QuizQuestion(
            session_id=session.id,
            question_type=qd["question_type"],
            stem=qd["stem"],
            options=qd.get("options"),
            correct_answer=qd["correct_answer"],
            explanation=qd.get("explanation"),
            kb_reference=qd.get("kb_reference"),
            question_index=qd["question_index"],
        )
        db.add(question)

    db.commit()
    db.refresh(session)

    return QuizSessionResponse(
        id=str(session.id),
        category_id=str(session.category_id) if session.category_id else None,
        document_ids=[str(d) for d in session.document_ids] if session.document_ids else None,
        question_count=session.question_count,
        score=session.score,
        status=session.status,
        created_at=session.created_at.isoformat(),
        completed_at=session.completed_at.isoformat() if session.completed_at else None,
        questions=[
            _question_to_response(q, hide_answer=True)
            for q in (session.questions or [])
        ],
    )


@router.post("/sessions/{session_id}/answers", response_model=QuizAnswerResponse)
def submit_answer(
    session_id: uuid.UUID,
    req: QuizAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="测验会话不存在")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="该测验已完成")

    question = db.query(QuizQuestion).filter(
        QuizQuestion.id == req.question_id,
        QuizQuestion.session_id == session_id,
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")

    # Check if already answered
    existing = db.query(QuizAnswer).filter(QuizAnswer.question_id == question.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="该题已作答")

    # Grade the answer
    if question.question_type == "choice":
        if not req.user_answer.strip():
            raise HTTPException(status_code=400, detail="选择题必须选择一个选项")
        grade_result = quiz_service.grade_choice_answer(
            req.user_answer, question.correct_answer
        )
    elif not req.user_answer.strip():
        # Short answer: allow skipping
        grade_result = {
            "is_correct": False,
            "score": 0.0,
            "feedback": "未作答。",
        }
    else:
        try:
            grade_result = quiz_service.grade_short_answer(
                stem=question.stem,
                correct_answer=question.correct_answer,
                user_answer=req.user_answer,
            )
        except Exception:
            grade_result = {
                "is_correct": None,
                "score": 0.5,
                "feedback": "AI 评分暂时不可用，请人工评阅。",
            }

    answer = QuizAnswer(
        question_id=question.id,
        user_answer=req.user_answer,
        is_correct=grade_result.get("is_correct"),
        score=grade_result.get("score"),
        feedback=grade_result.get("feedback"),
    )
    db.add(answer)
    db.commit()
    db.refresh(answer)

    # Check if all questions answered → complete session
    total_questions = session.question_count
    answered_count = (
        db.query(QuizAnswer)
        .join(QuizQuestion)
        .filter(QuizQuestion.session_id == session_id)
        .count()
    )
    if answered_count >= total_questions:
        quiz_service.complete_session(db, session)

    return QuizAnswerResponse(
        id=str(answer.id),
        question_id=str(answer.question_id),
        user_answer=answer.user_answer,
        is_correct=answer.is_correct,
        score=answer.score,
        feedback=answer.feedback,
        correct_answer=question.correct_answer,
        explanation=question.explanation,
        created_at=answer.created_at.isoformat(),
    )


@router.get("/sessions", response_model=list[QuizSessionListItem])
def list_quiz_sessions(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offset = (page - 1) * page_size
    query = apply_user_filter(db.query(QuizSession), QuizSession, current_user)
    sessions = (
        query.order_by(QuizSession.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    return [
        QuizSessionListItem(
            id=str(s.id),
            category_id=str(s.category_id) if s.category_id else None,
            document_ids=[str(d) for d in s.document_ids] if s.document_ids else None,
            question_count=s.question_count,
            score=s.score,
            status=s.status,
            created_at=s.created_at.isoformat(),
            completed_at=s.completed_at.isoformat() if s.completed_at else None,
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=QuizSessionResponse)
def get_quiz_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="测验会话不存在")

    is_completed = session.status == "completed"
    return QuizSessionResponse(
        id=str(session.id),
        category_id=str(session.category_id) if session.category_id else None,
        document_ids=[str(d) for d in session.document_ids] if session.document_ids else None,
        question_count=session.question_count,
        score=session.score,
        status=session.status,
        created_at=session.created_at.isoformat(),
        completed_at=session.completed_at.isoformat() if session.completed_at else None,
        questions=[
            _question_to_response(q, hide_answer=not is_completed)
            for q in (session.questions or [])
        ],
    )


@router.delete("/sessions/{session_id}", status_code=204)
def delete_quiz_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="测验会话不存在")
    db.delete(session)
    db.commit()
