import uuid
from datetime import datetime
from pydantic import BaseModel


# --- Persona ---
class PersonaInput(BaseModel):
    name: str
    age: int | None = None
    gender: str | None = None
    occupation: str | None = None
    personality: str | None = None
    investment_experience: str | None = None
    wealth_level: str | None = None
    risk_preference: str | None = None
    goals: str | None = None


# --- Session ---
class CreateSessionRequest(BaseModel):
    customer_id: str | None = None
    persona: PersonaInput | None = None
    scenario: str


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
    content: str


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
