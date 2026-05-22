import uuid
from datetime import datetime
from pydantic import BaseModel


class ConversationMessageResponse(BaseModel):
    id: uuid.UUID
    speaker: str
    content: str
    start_time: float
    end_time: float
    confidence: float | None = None

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID | None = None
    customer_name: str | None = None
    duration_seconds: float | None = None
    status: str
    message_count: int = 0
    started_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class ConversationDetailResponse(ConversationResponse):
    messages: list[ConversationMessageResponse] = []
    analysis_results: dict | None = None
    error_message: str | None = None


class ConversationListResponse(BaseModel):
    items: list[ConversationResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
