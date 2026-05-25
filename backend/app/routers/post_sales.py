import math
import os
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.customer import Customer
from ..models.post_sales import PostSalesSession, PostSalesMessage
from ..models.user import User
from ..utils.auth import get_current_user, apply_user_filter
from ..schemas.post_sales import (
    CreateSessionRequest, UpdateSessionRequest, SessionResponse,
    SessionListResponse, SessionDetailResponse, MessageResponse,
    AddMessageRequest,
)
from ..services.post_sales_service import (
    transcribe_audio, generate_report, generate_summary,
)

router = APIRouter()


def _session_to_response(session: PostSalesSession, db: Session) -> SessionResponse:
    customer_name = None
    if session.customer_id:
        customer = db.query(Customer).filter(Customer.id == session.customer_id).first()
        customer_name = customer.name if customer else None

    return SessionResponse(
        id=session.id,
        customer_id=session.customer_id,
        customer_name=customer_name,
        status=session.status,
        summary=session.summary,
        started_at=session.started_at,
        completed_at=session.completed_at,
        message_count=len(session.messages) if session.messages else 0,
    )


# ──────────────────────────── POST /sessions ────────────────────────────

@router.post("/sessions", response_model=SessionResponse, status_code=201)
def create_session(data: CreateSessionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = PostSalesSession(
        customer_id=uuid.UUID(data.customer_id) if data.customer_id else None,
        status="recording",
        user_id=current_user.id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_to_response(session, db)


# ──────────────────────────── GET /sessions ────────────────────────────

@router.get("/sessions", response_model=SessionListResponse)
def list_sessions(
    customer_id: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = apply_user_filter(db.query(PostSalesSession), PostSalesSession, current_user)
    if customer_id:
        query = query.filter(PostSalesSession.customer_id == customer_id)
    if status:
        query = query.filter(PostSalesSession.status == status)

    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size
    sessions = query.order_by(PostSalesSession.started_at.desc()).offset(offset).limit(page_size).all()

    items = [_session_to_response(s, db) for s in sessions]
    return SessionListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)


# ──────────────────────────── GET /sessions/{id} ────────────────────────────

@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session(session_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = apply_user_filter(db.query(PostSalesSession), PostSalesSession, current_user) \
        .filter(PostSalesSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    resp = _session_to_response(session, db)
    return SessionDetailResponse(
        **(resp.model_dump()),
        messages=[MessageResponse.model_validate(m) for m in (session.messages or [])],
        report=session.report,
    )


# ──────────────────────────── PATCH /sessions/{id} ────────────────────────────

@router.patch("/sessions/{session_id}", response_model=SessionResponse)
def update_session(session_id: uuid.UUID, data: UpdateSessionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = apply_user_filter(db.query(PostSalesSession), PostSalesSession, current_user) \
        .filter(PostSalesSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if data.customer_id is not None:
        if data.customer_id == "":
            session.customer_id = None
        else:
            try:
                cid = uuid.UUID(data.customer_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid customer_id format")
            customer = db.query(Customer).filter(Customer.id == cid).first()
            if not customer:
                raise HTTPException(status_code=404, detail="Customer not found")
            session.customer_id = cid

    db.commit()
    db.refresh(session)
    return _session_to_response(session, db)


# ──────────────────────────── POST /sessions/{id}/messages ────────────────────────────

@router.post("/sessions/{session_id}/messages", response_model=MessageResponse, status_code=201)
def add_message(session_id: uuid.UUID, data: AddMessageRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = apply_user_filter(db.query(PostSalesSession), PostSalesSession, current_user) \
        .filter(PostSalesSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    # Determine role based on content prefix or default to salesperson
    role = "salesperson"
    content = data.content
    if content.startswith("[客户]:"):
        role = "customer"
        content = content[5:].strip()
    elif content.startswith("[系统]:"):
        role = "system"
        content = content[5:].strip()

    msg = PostSalesMessage(session_id=session.id, role=role, content=content)
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return MessageResponse.model_validate(msg)


# ──────────────────────────── POST /sessions/{id}/audio ────────────────────────────

@router.post("/sessions/{session_id}/audio", response_model=list[MessageResponse])
def upload_audio(session_id: uuid.UUID, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = apply_user_filter(db.query(PostSalesSession), PostSalesSession, current_user) \
        .filter(PostSalesSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    os.makedirs(settings.audio_upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "recording.wav")[1] or ".wav"
    file_name = f"{session_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}{ext}"
    file_path = os.path.join(settings.audio_upload_dir, file_name)

    with open(file_path, "wb") as f:
        f.write(file.file.read())

    # Save audio file reference
    audio_msg = PostSalesMessage(
        session_id=session.id,
        role="system",
        content=f"[Audio uploaded: {file_name}]",
        audio_file=file_name,
    )
    db.add(audio_msg)

    # Attempt transcription
    try:
        segments = transcribe_audio(file_path)
        results = []
        for seg in segments:
            transcript_msg = PostSalesMessage(
                session_id=session.id,
                role="salesperson",
                content=f"[Transcribed {seg['start']:.1f}s-{seg['end']:.1f}s]: {seg['text']}",
            )
            db.add(transcript_msg)
            results.append(transcript_msg)
        db.commit()
        for r in results:
            db.refresh(r)
        db.refresh(audio_msg)
        return [MessageResponse.model_validate(audio_msg)] + [MessageResponse.model_validate(m) for m in results]
    except Exception as e:
        # Save error but don't block — user can still add text messages
        audio_msg.content += f" (Transcription failed: {str(e)[:200]})"
        db.commit()
        db.refresh(audio_msg)
        return [MessageResponse.model_validate(audio_msg)]


# ──────────────────────────── POST /sessions/{id}/end ────────────────────────────

@router.post("/sessions/{session_id}/end", response_model=SessionDetailResponse)
def end_session(session_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = apply_user_filter(db.query(PostSalesSession), PostSalesSession, current_user) \
        .filter(PostSalesSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    # Generate summary
    messages = [{"role": m.role, "content": m.content} for m in (session.messages or [])]
    try:
        summary = generate_summary(messages, str(current_user.id))
    except Exception:
        summary = {"title": "通话记录", "outcome": "无总结"}

    # Get customer profile for report context
    customer_profile = None
    if session.customer_id:
        customer = db.query(Customer).filter(Customer.id == session.customer_id).first()
        if customer:
            customer_profile = {
                "name": customer.name,
                "structured_data": customer.structured_data,
                "ai_profile": customer.ai_profile,
            }

    # Generate full report
    try:
        report = generate_report(messages, customer_profile, str(current_user.id))
    except Exception as e:
        report = {"error": str(e), "raw": "Report generation failed"}

    session.status = "completed"
    session.completed_at = datetime.utcnow()
    session.summary = summary
    session.report = report
    db.commit()
    db.refresh(session)

    resp = _session_to_response(session, db)
    return SessionDetailResponse(
        **(resp.model_dump()),
        messages=[MessageResponse.model_validate(m) for m in (session.messages or [])],
        report=session.report,
    )


# ──────────────────────────── DELETE /sessions/{id} ────────────────────────────

@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = apply_user_filter(db.query(PostSalesSession), PostSalesSession, current_user) \
        .filter(PostSalesSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
