import uuid
from datetime import datetime
from pydantic import BaseModel


class CustomerCreate(BaseModel):
    name: str
    raw_input: str | None = None
    structured_data: dict | None = None
    ai_profile: dict | None = None
    scores: dict | None = None


class CustomerAnalyzeRequest(BaseModel):
    raw_text: str


class CustomerAnalyzeResponse(BaseModel):
    name: str
    structured_data: dict
    ai_profile: dict
    scores: dict | None = None


class CustomerResponse(BaseModel):
    id: uuid.UUID
    name: str
    raw_input: str | None = None
    structured_data: dict | None = None
    ai_profile: dict | None = None
    scores: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerListResponse(BaseModel):
    items: list[CustomerResponse]
    total: int
