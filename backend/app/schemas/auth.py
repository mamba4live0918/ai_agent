import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class UserRegister(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    email: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)
    role: str | None = None


class UserLogin(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    role: str
    group_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RoleUpdateRequest(BaseModel):
    role: str = Field(..., min_length=1, max_length=50)


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
