import uuid
from datetime import datetime
from pydantic import BaseModel


# --- Session ---
class CreateSessionRequest(BaseModel):
    customer_id: str | None = None


class SessionResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID | None = None
    customer_name: str | None = None
    status: str
    summary: dict | None = None
    started_at: datetime
    completed_at: datetime | None = None
    message_count: int = 0

    model_config = {"from_attributes": True}


class SessionListResponse(BaseModel):
    items: list[SessionResponse]
    total: int
    page: int = 1
    page_size: int = 20
    total_pages: int = 1


# --- Messages ---
class MessageResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    audio_file: str | None = None
    analysis: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UpdateSessionRequest(BaseModel):
    customer_id: str | None = None


class AddMessageRequest(BaseModel):
    content: str


class SessionDetailResponse(SessionResponse):
    messages: list[MessageResponse] = []
    report: dict | None = None


# --- Report ---
class ReportResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    scores: dict
    summary: str
    sentiment_trajectory: list | None = None
    key_moments: list | None = None
    capability_radar: dict | None = None
    kb_matches: list | None = None
    deal_probability: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
