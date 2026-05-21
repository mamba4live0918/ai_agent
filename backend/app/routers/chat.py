from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..models.user import User
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


@router.post("", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest, current_user: User = Depends(get_current_user)):
    # Namespace conversations per user to isolate chat histories
    namespaced_id = None
    if req.conversation_id:
        namespaced_id = f"{current_user.id}:{req.conversation_id}"
    result = rag_chat(req.message, namespaced_id)
    # Strip namespace prefix from returned conversation_id
    raw_id = result.get("conversation_id", "")
    if raw_id and ":" in raw_id:
        result["conversation_id"] = raw_id.split(":", 1)[1]
    return ChatResponse(**result)
