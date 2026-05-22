from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.auth import UserRegister, UserLogin, UserResponse, TokenResponse
from ..utils.auth import hash_password, verify_password, create_access_token, get_current_user
from ..services.audit_service import log_action

router = APIRouter()


@router.post("/register", status_code=201, response_model=TokenResponse)
def register(data: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"user_id": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password):
        log_action(
            db,
            user_id=user.id if user else None,
            action="login_failed",
            resource_type="auth",
            ip_address=request.client.host if request.client else None,
            detail=f"Failed login for username: {data.username}",
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")
    log_action(
        db,
        user_id=user.id,
        action="login_success",
        resource_type="auth",
        ip_address=request.client.host if request.client else None,
    )
    token = create_access_token({"user_id": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
