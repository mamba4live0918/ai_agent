import uuid
from datetime import datetime
from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    description: str | None = None
    icon: str | None = None
    sort_order: int = 0
    parent_id: uuid.UUID | None = None


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    icon: str | None = None
    sort_order: int
    created_at: datetime
    document_count: int = 0
    parent_id: uuid.UUID | None = None
    children_count: int = 0

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: uuid.UUID
    title: str
    category_ids: list[uuid.UUID] = []
    file_type: str
    content_preview: str | None = None
    chunk_count: int
    is_archived: bool = False
    created_at: datetime
    category_names: list[str] = []

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    page: int = 1
    page_size: int = 20
    total_pages: int = 1


class DocumentUpdateCategories(BaseModel):
    category_ids: list[uuid.UUID]


class TableData(BaseModel):
    columns: list[str]
    rows: list[list[str]]


class DocumentContentResponse(BaseModel):
    title: str
    file_type: str
    content: str
    html: str | None = None
    table: TableData | None = None
