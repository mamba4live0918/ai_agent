from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    feedback_text: str | None = None


class FeedbackResponse(BaseModel):
    id: UUID
    user_id: UUID
    rating: int
    feedback_text: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackStats(BaseModel):
    total: int
    average: float
    distribution: dict[int, int]
