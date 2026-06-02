import uuid
from datetime import datetime
from pydantic import BaseModel, Field


# --- Persona ---
class PersonaInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    age: int | None = None
    gender: str | None = Field(None, max_length=50)
    occupation: str | None = Field(None, max_length=255)
    personality: str | None = Field(None, max_length=10000)
    investment_experience: str | None = Field(None, max_length=10000)
    wealth_level: str | None = Field(None, max_length=255)
    risk_preference: str | None = Field(None, max_length=255)
    goals: str | None = Field(None, max_length=10000)


# --- Session ---
class CreateSessionRequest(BaseModel):
    customer_id: str | None = None
    persona: PersonaInput | None = None
    scenario: str = Field(..., min_length=1, max_length=10000)


class SessionResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID | None = None
    customer_name: str | None = None
    persona: dict
    scenario: str
    scenario_context: str | None = None
    status: str
    coach_suggestions: list | None = None
    started_at: datetime
    completed_at: datetime | None = None
    message_count: int = 0
    has_review: bool = False

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
    coach_tip: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionDetailResponse(SessionResponse):
    messages: list[MessageResponse] = []
    review: "ReviewResponse | None" = None


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class SendMessageResponse(BaseModel):
    user_message: MessageResponse
    customer_message: MessageResponse
    coach_tips: dict | None = None
    conversation_ending: bool = False


# --- Review ---
class ReviewResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    scores: dict
    dimension_scores: dict
    overall_comment: str | None = None
    weakness_analysis: list | None = None
    highlights: list | None = None
    next_steps: list | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
