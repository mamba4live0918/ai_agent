import math
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.sales_conversation import SalesConversation
from ..models.user import User
from ..models.customer import Customer
from ..utils.auth import get_current_user, apply_user_filter
from ..services.audit_service import log_action
from ..services.voice_service import save_audio_file, process_conversation_audio
from ..schemas.sales_assistance import (
    ConversationResponse, ConversationDetailResponse, ConversationListResponse,
    ConversationMessageResponse,
)

router = APIRouter()


def _conversation_to_response(conv: SalesConversation, db: Session) -> ConversationResponse:
    customer_name = None
    if conv.customer_id:
        customer = db.query(Customer).filter(Customer.id == conv.customer_id).first()
        if customer:
            customer_name = customer.name
    msg_count = len(conv.messages) if conv.messages else 0
    return ConversationResponse(
        id=conv.id,
        customer_id=conv.customer_id,
        customer_name=customer_name,
        duration_seconds=conv.duration_seconds,
        status=conv.status,
        message_count=msg_count,
        started_at=conv.started_at,
        completed_at=conv.completed_at,
    )


@router.get("/conversations", response_model=ConversationListResponse)
def list_conversations(
    customer_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = apply_user_filter(db.query(SalesConversation), SalesConversation, current_user)
    if customer_id:
        query = query.filter(SalesConversation.customer_id == customer_id)
    if status:
        query = query.filter(SalesConversation.status == status)
    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size
    items = query.order_by(SalesConversation.started_at.desc()).offset(offset).limit(page_size).all()
    return ConversationListResponse(
        items=[_conversation_to_response(item, db) for item in items],
        total=total, page=page, page_size=page_size, total_pages=total_pages,
    )


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
def upload_conversation(
    request: Request,
    audio: UploadFile = File(...),
    customer_id: str | None = Form(None),
    duration: float = Form(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ext = (audio.filename or "").split(".")[-1].lower() if "." in (audio.filename or "") else "webm"
    if ext not in ("webm", "wav", "mp3", "m4a", "ogg"):
        raise HTTPException(status_code=400, detail=f"Unsupported audio format: .{ext}")

    filepath, _ = save_audio_file(audio, user_id=str(current_user.id))

    customer_uuid = uuid.UUID(customer_id) if customer_id else None
    if customer_uuid:
        cust = apply_user_filter(db.query(Customer), Customer, current_user).filter(Customer.id == customer_uuid).first()
        if not cust:
            raise HTTPException(status_code=404, detail="Customer not found")

    conv = SalesConversation(
        user_id=current_user.id,
        customer_id=customer_uuid,
        audio_file_path=filepath,
        duration_seconds=duration,
        status="uploaded",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    log_action(
        db, user_id=current_user.id, action="conversation_upload",
        resource_type="sales_conversation", resource_id=str(conv.id),
        ip_address=request.client.host if request.client else None,
        detail=f"Uploaded audio: {audio.filename}",
    )
    return _conversation_to_response(conv, db)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = apply_user_filter(db.query(SalesConversation), SalesConversation, current_user)\
        .filter(SalesConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    base = _conversation_to_response(conv, db)
    return ConversationDetailResponse(
        **base.model_dump(),
        messages=[ConversationMessageResponse.model_validate(m) for m in (conv.messages or [])],
        analysis_results=conv.analysis_results,
        error_message=conv.error_message,
    )


@router.post("/conversations/{conversation_id}/process", response_model=ConversationDetailResponse)
def process_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = apply_user_filter(db.query(SalesConversation), SalesConversation, current_user)\
        .filter(SalesConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.status not in ("uploaded", "failed"):
        raise HTTPException(status_code=400, detail=f"Cannot process conversation in status: {conv.status}")

    conv = process_conversation_audio(conversation_id, user_id=str(current_user.id), db=db)
    base = _conversation_to_response(conv, db)
    return ConversationDetailResponse(
        **base.model_dump(),
        messages=[ConversationMessageResponse.model_validate(m) for m in (conv.messages or [])],
        analysis_results=conv.analysis_results,
        error_message=conv.error_message,
    )


@router.get("/conversations/{conversation_id}/analysis")
def get_analysis(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = apply_user_filter(db.query(SalesConversation), SalesConversation, current_user)\
        .filter(SalesConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"analysis_results": conv.analysis_results, "status": conv.status, "error_message": conv.error_message}


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = apply_user_filter(db.query(SalesConversation), SalesConversation, current_user)\
        .filter(SalesConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.audio_file_path and os.path.exists(conv.audio_file_path):
        os.remove(conv.audio_file_path)
    db.delete(conv)
    db.commit()
    log_action(
        db, user_id=current_user.id, action="conversation_delete",
        resource_type="sales_conversation", resource_id=str(conversation_id),
        ip_address=request.client.host if request.client else None,
        detail="Deleted sales conversation and audio",
    )
