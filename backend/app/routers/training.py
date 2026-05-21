import math
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.customer import Customer
from ..models.training import TrainingSession, TrainingMessage, TrainingReview
from ..schemas.training import (
    CreateSessionRequest, SessionResponse, SessionListResponse,
    SessionDetailResponse, MessageResponse,
    SendMessageRequest, SendMessageResponse,
    ReviewResponse,
)
from ..services.training_service import (
    generate_briefing, simulate_customer, simulate_coach,
    generate_quick_replies, generate_review,
)

router = APIRouter()

SCENARIO_NAMES = {"客诉处理": "客诉处理", "产品讲解": "产品讲解", "异议处理": "异议处理"}


def _format_history(messages: list[TrainingMessage], max_rounds: int = 10) -> str:
    """Format the last N rounds as text for LLM context."""
    recent = messages[-(max_rounds * 2):]  # each round = user + customer
    lines = []
    for m in recent:
        role_label = {"user": "销售", "customer": "客户", "coach": "教练"}.get(m.role, m.role)
        lines.append(f"{role_label}: {m.content}")
    return "\n".join(lines)


def _session_to_response(session: TrainingSession) -> SessionResponse:
    review_exists = session.review is not None
    return SessionResponse(
        id=session.id,
        customer_id=session.customer_id,
        customer_name=None,
        persona=session.persona,
        scenario=session.scenario,
        scenario_context=session.scenario_context,
        status=session.status,
        coach_suggestions=session.coach_suggestions,
        started_at=session.started_at,
        completed_at=session.completed_at,
        message_count=len(session.messages) if session.messages else 0,
        has_review=review_exists,
    )


# ──────────────────────────── POST /sessions ────────────────────────────

@router.post("/sessions", response_model=SessionResponse, status_code=201)
def create_session(data: CreateSessionRequest, db: Session = Depends(get_db)):
    if data.scenario not in SCENARIO_NAMES:
        raise HTTPException(status_code=400, detail=f"Invalid scenario. Must be one of: {list(SCENARIO_NAMES.keys())}")

    customer_name = None

    if data.customer_id:
        # From existing customer
        customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        customer_name = customer.name

        # Build persona from customer data
        sd = customer.structured_data or {}
        ap = customer.ai_profile or {}
        persona = {
            "name": customer.name,
            "age": sd.get("age"),
            "gender": sd.get("gender"),
            "occupation": sd.get("occupation"),
            "personality": ap.get("persona_summary", ""),
            "investment_experience": sd.get("investment_experience"),
            "wealth_level": sd.get("assets"),
            "risk_preference": sd.get("risk_preference"),
            "goals": sd.get("goals"),
        }

        # Reuse presales_prep for scenario context if available
        prep = customer.presales_prep or {}
        scenario_context = None
        if prep:
            parts = [prep.get("lifecycle_analysis", ""), prep.get("potential_difficulties", ""), prep.get("response_scripts", "")]
            scenario_context = "\n\n".join(p for p in parts if p)
        if not scenario_context:
            briefing = generate_briefing(persona, data.scenario)
            scenario_context = briefing.get("scenario_context", "")

    elif data.persona:
        # Manual persona
        persona = data.persona.model_dump(exclude_none=True)
        customer_name = persona.get("name", "手动创建")
        briefing = generate_briefing(persona, data.scenario)
        scenario_context = briefing.get("scenario_context", "")
    else:
        raise HTTPException(status_code=400, detail="Either customer_id or persona is required")

    session = TrainingSession(
        customer_id=uuid.UUID(data.customer_id) if data.customer_id else None,
        persona=persona,
        scenario=data.scenario,
        scenario_context=scenario_context,
        status="pending",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    result = _session_to_response(session)
    result.customer_name = customer_name
    return result


# ──────────────────────────── GET /sessions ────────────────────────────

@router.get("/sessions", response_model=SessionListResponse)
def list_sessions(
    customer_id: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(TrainingSession)
    if customer_id:
        query = query.filter(TrainingSession.customer_id == customer_id)
    if status:
        query = query.filter(TrainingSession.status == status)

    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size
    sessions = query.order_by(TrainingSession.started_at.desc()).offset(offset).limit(page_size).all()

    items = []
    for s in sessions:
        resp = _session_to_response(s)
        if s.customer_id:
            customer = db.query(Customer).filter(Customer.id == s.customer_id).first()
            resp.customer_name = customer.name if customer else None
        items.append(resp)

    return SessionListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)


# ──────────────────────────── GET /sessions/{id} ────────────────────────────

@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session(session_id: uuid.UUID, db: Session = Depends(get_db)):
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    resp = _session_to_response(session)
    if session.customer_id:
        customer = db.query(Customer).filter(Customer.id == session.customer_id).first()
        resp.customer_name = customer.name if customer else None

    detail = SessionDetailResponse(
        **(resp.model_dump()),
        messages=[MessageResponse.model_validate(m) for m in (session.messages or [])],
        review=ReviewResponse.model_validate(session.review) if session.review else None,
    )
    return detail


# ──────────────────────────── POST /sessions/{id}/messages ────────────────────────────

@router.post("/sessions/{session_id}/messages", response_model=SendMessageResponse)
def send_message(session_id: uuid.UUID, data: SendMessageRequest, db: Session = Depends(get_db)):
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    # Mark as active on first message
    if session.status == "pending":
        session.status = "active"

    # Save user message
    user_msg = TrainingMessage(session_id=session.id, role="user", content=data.content)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # Format conversation history (last 10 rounds)
    all_messages = db.query(TrainingMessage).filter(
        TrainingMessage.session_id == session.id
    ).order_by(TrainingMessage.created_at).all()
    history_text = _format_history(all_messages)

    # Call customer agent
    scenario_display = SCENARIO_NAMES.get(session.scenario, session.scenario)
    customer_result = simulate_customer(
        persona=session.persona,
        scenario=scenario_display,
        scenario_context=session.scenario_context or "",
        history_text=history_text,
        user_message=data.content,
    )
    customer_reply = customer_result.get("reply", "") or customer_result.get("raw", "（客户没有回应）")
    conversation_ending = bool(customer_result.get("conversation_ending", False))

    # Save customer message
    customer_msg = TrainingMessage(session_id=session.id, role="customer", content=customer_reply)
    db.add(customer_msg)
    db.commit()
    db.refresh(customer_msg)

    # Call coach agent
    coach_result = simulate_coach(
        persona=session.persona,
        scenario=scenario_display,
        history_text=history_text + f"\n销售: {data.content}\n客户: {customer_reply}",
        user_message=data.content,
        customer_reply=customer_reply,
    )

    # Attach coach_tip to user message
    user_msg.coach_tip = coach_result
    db.commit()
    db.refresh(user_msg)

    # Update coach_suggestions aggregate
    if session.coach_suggestions is None:
        session.coach_suggestions = []
    suggestions = list(session.coach_suggestions) if isinstance(session.coach_suggestions, list) else []
    suggestions.append({
        "message_index": len(all_messages),
        "tips": coach_result,
        "created_at": datetime.utcnow().isoformat(),
    })
    session.coach_suggestions = suggestions
    db.commit()

    return SendMessageResponse(
        user_message=MessageResponse.model_validate(user_msg),
        customer_message=MessageResponse.model_validate(customer_msg),
        coach_tips=coach_result,
        conversation_ending=conversation_ending,
    )


# ──────────────────────────── POST /sessions/{id}/quick-replies ────────────────────────────

@router.post("/sessions/{session_id}/quick-replies")
def get_quick_replies(session_id: uuid.UUID, db: Session = Depends(get_db)):
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    all_messages = db.query(TrainingMessage).filter(
        TrainingMessage.session_id == session.id
    ).order_by(TrainingMessage.created_at).all()

    # Find last customer message
    last_customer = ""
    for m in reversed(all_messages):
        if m.role == "customer":
            last_customer = m.content
            break

    history_text = _format_history(all_messages)
    result = generate_quick_replies(
        persona=session.persona,
        scenario=session.scenario,
        history_text=history_text,
        last_customer_message=last_customer,
    )
    return result


# ──────────────────────────── POST /sessions/{id}/end ────────────────────────────

@router.post("/sessions/{session_id}/end", response_model=ReviewResponse)
def end_session(session_id: uuid.UUID, db: Session = Depends(get_db)):
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    all_messages = db.query(TrainingMessage).filter(
        TrainingMessage.session_id == session.id
    ).order_by(TrainingMessage.created_at).all()

    full_history = _format_history(all_messages)
    review_data = generate_review(
        persona=session.persona,
        scenario=session.scenario,
        full_history=full_history,
    )

    review = TrainingReview(
        session_id=session.id,
        scores=review_data.get("scores", {}),
        dimension_scores=review_data.get("dimension_scores", {}),
        overall_comment=review_data.get("overall_comment", ""),
        weakness_analysis=review_data.get("weakness_analysis", []),
        highlights=review_data.get("highlights", []),
        next_steps=review_data.get("next_steps", []),
    )
    db.add(review)
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(review)

    return ReviewResponse.model_validate(review)


# ──────────────────────────── GET /sessions/{id}/review ────────────────────────────

@router.get("/sessions/{session_id}/review", response_model=ReviewResponse)
def get_review(session_id: uuid.UUID, db: Session = Depends(get_db)):
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.review:
        raise HTTPException(status_code=404, detail="Review not found — session not completed yet")

    return ReviewResponse.model_validate(session.review)


# ──────────────────────────── DELETE /sessions/{id} ────────────────────────────

@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: uuid.UUID, db: Session = Depends(get_db)):
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)  # cascade deletes messages and review
    db.commit()
