from fastapi import APIRouter
from pydantic import BaseModel

from ..services.rag_service import chat as rag_chat

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str
    sources: list[dict]


@router.post("", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest):
    result = rag_chat(req.message, req.conversation_id)
    return ChatResponse(**result)
