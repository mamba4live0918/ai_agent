import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.chat import ChatConversation, ChatMessage
from ..database import get_db
from ..utils.auth import get_current_user
from ..services.rag_service import chat as rag_chat

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str
    sources: list[dict]


class ConversationItem(BaseModel):
    id: str
    title: str
    message_count: int
    updated_at: str
    created_at: str

    model_config = {"from_attributes": True}


class MessageItem(BaseModel):
    id: str
    role: str
    content: str
    sources: list[dict] | None
    created_at: str

    model_config = {"from_attributes": True}


def _conversation_to_item(conv: ChatConversation) -> ConversationItem:
    return ConversationItem(
        id=str(conv.id),
        title=conv.title,
        message_count=len(conv.messages) if conv.messages else 0,
        updated_at=(conv.messages[-1].created_at.isoformat() if conv.messages else conv.created_at.isoformat()),
        created_at=conv.created_at.isoformat(),
    )


@router.post("", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Resolve or create conversation
    conv = None
    if req.conversation_id:
        try:
            conv = db.query(ChatConversation).filter(
                ChatConversation.id == req.conversation_id,
                ChatConversation.user_id == current_user.id,
            ).first()
        except ValueError:
            pass

    if conv is None:
        # Generate title from first message (truncated)
        title = req.message[:40] + ("..." if len(req.message) > 40 else "")
        conv = ChatConversation(
            user_id=current_user.id,
            title=title,
        )
        db.add(conv)
        db.flush()

    # Save user message
    user_msg = ChatMessage(
        conversation_id=conv.id,
        role="user",
        content=req.message,
    )
    db.add(user_msg)
    db.flush()

    # Use namespaced conversation ID for RAG service
    namespaced_id = f"{current_user.id}:{conv.id}"
    result = rag_chat(req.message, user_id=str(current_user.id), conversation_id=namespaced_id)

    # Save assistant message
    assistant_msg = ChatMessage(
        conversation_id=conv.id,
        role="assistant",
        content=result["answer"],
        sources=result.get("sources", []),
    )
    db.add(assistant_msg)

    # Update conversation title from first exchange
    if conv.title and conv.title == req.message[:40] + ("..." if len(req.message) > 40 else ""):
        if len(conv.title) > 40:
            conv.title = req.message[:40] + "..."

    db.commit()

    return ChatResponse(
        answer=result["answer"],
        conversation_id=str(conv.id),
        sources=result.get("sources", []),
    )


@router.get("/conversations", response_model=list[ConversationItem])
def list_conversations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    convs = (
        db.query(ChatConversation)
        .filter(ChatConversation.user_id == current_user.id)
        .order_by(ChatConversation.created_at.desc())
        .all()
    )
    return [_conversation_to_item(c) for c in convs]


@router.get("/conversations/{conv_id}", response_model=list[MessageItem])
def get_conversation(conv_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(ChatConversation).filter(
        ChatConversation.id == conv_id,
        ChatConversation.user_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return [
        MessageItem(
            id=str(m.id),
            role=m.role,
            content=m.content,
            sources=m.sources,
            created_at=m.created_at.isoformat(),
        )
        for m in conv.messages
    ]


@router.delete("/conversations/{conv_id}", status_code=204)
def delete_conversation(conv_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(ChatConversation).filter(
        ChatConversation.id == conv_id,
        ChatConversation.user_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(conv)
    db.commit()
