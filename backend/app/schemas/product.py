import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(..., min_length=1, max_length=50)
    risk_level: int
    expected_return: float
    min_investment: float
    description: Optional[str] = Field(None, max_length=10000)
    issuer: Optional[str] = Field(None, max_length=255)
    target_tags: Optional[list[str]] = None
    lock_period: Optional[str] = None
    fund_code: Optional[str] = None


class ProductBatchImport(BaseModel):
    products: list[ProductCreate]


class ProductResponse(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    risk_level: int
    expected_return: float
    min_investment: float
    description: str | None = None
    issuer: str | None = None
    target_tags: list[str] | None = None
    lock_period: str | None = None
    fund_code: str | None = None
    nav_history: list | None = None
    source: str
    nav_updated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    total: int
    page: int = 1
    page_size: int = 10
    total_pages: int = 1
