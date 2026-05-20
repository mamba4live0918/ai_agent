import uuid
from datetime import datetime
from pydantic import BaseModel


class CustomerCreate(BaseModel):
    name: str
    raw_input: str | None = None
    structured_data: dict | None = None
    ai_profile: dict | None = None
    scores: dict | None = None
    presales_prep: dict | None = None
    allocation_plan: dict | None = None


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
    presales_prep: dict | None = None
    allocation_plan: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AllocationPlanSave(BaseModel):
    user_plan: dict
    total_investable: int | None = None


class CustomerListResponse(BaseModel):
    items: list[CustomerResponse]
    total: int
    page: int = 1
    page_size: int = 20
    total_pages: int = 1
