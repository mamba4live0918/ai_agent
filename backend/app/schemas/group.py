from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class GroupCreate(BaseModel):
    name: str
    description: str | None = None
    admin_id: UUID | None = None


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    admin_id: UUID | None = None


class GroupMemberResponse(BaseModel):
    id: UUID
    username: str
    email: str
    role: str
    group_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    admin_id: UUID | None
    admin_name: str | None = None
    member_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupListResponse(BaseModel):
    items: list[GroupResponse]
    total: int
