import uuid
from datetime import datetime
from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    description: str | None = None
    icon: str | None = None
    sort_order: int = 0


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    icon: str | None = None
    sort_order: int
    created_at: datetime
    document_count: int = 0

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: uuid.UUID
    title: str
    category_id: uuid.UUID
    file_type: str
    content_preview: str | None = None
    chunk_count: int
    created_at: datetime
    category_name: str | None = None

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
