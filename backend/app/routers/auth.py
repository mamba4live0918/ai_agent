from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.auth import UserRegister, UserLogin, UserResponse, TokenResponse
from ..utils.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, blacklist_token, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES,
)
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

    if user and user.locked_until and user.locked_until > datetime.now(timezone.utc):
        remaining = int((user.locked_until - datetime.now(timezone.utc)).total_seconds() // 60) + 1
        log_action(
            db,
            user_id=user.id,
            action="login_blocked",
            resource_type="auth",
            ip_address=request.client.host if request.client else None,
            detail=f"Account locked — {remaining} min remaining",
        )
        raise HTTPException(
            status_code=423,
            detail=f"Account locked. Try again in {remaining} minute(s).",
        )

    if not user or not verify_password(data.password, user.hashed_password):
        if user:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                user.failed_login_attempts = 0
            db.commit()
        log_action(
            db,
            user_id=user.id if user else None,
            action="login_failed",
            resource_type="auth",
            ip_address=request.client.host if request.client else None,
            detail=f"Failed login for username: {data.username}",
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    log_action(
        db,
        user_id=user.id,
        action="login_success",
        resource_type="auth",
        ip_address=request.client.host if request.client else None,
    )
    token = create_access_token({"user_id": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/logout", status_code=200)
def logout(request: Request, db: Session = Depends(get_db)):
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        blacklist_token(token, db)
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
