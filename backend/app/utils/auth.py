import uuid
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.user import User
from ..models.token_blacklist import TokenBlacklist


MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode.setdefault("jti", str(uuid.uuid4()))
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.access_token_expire_hours)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def _cleanup_expired_blacklist(db: Session):
    """Remove expired blacklist entries — called during get_current_user."""
    now = datetime.now(timezone.utc)
    db.query(TokenBlacklist).filter(TokenBlacklist.expires_at < now).delete()
    db.commit()


def _is_token_blacklisted(db: Session, jti: str) -> bool:
    return db.query(TokenBlacklist).filter(TokenBlacklist.jti == jti).first() is not None


def blacklist_token(token: str, db: Session):
    """Add token to blacklist on logout."""
    try:
        payload = decode_access_token(token)
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
            if expires_at > datetime.now(timezone.utc):
                entry = TokenBlacklist(jti=jti, expires_at=expires_at)
                db.add(entry)
                db.commit()
    except JWTError:
        pass


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = decode_access_token(token)
        user_id: str = payload.get("user_id")
        jti: str | None = payload.get("jti")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    _cleanup_expired_blacklist(db)
    if jti and _is_token_blacklisted(db, jti):
        raise HTTPException(status_code=401, detail="Token has been revoked")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_instructor(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "instructor"):
        raise HTTPException(status_code=403, detail="Instructor access required")
    return current_user


def apply_user_filter(query, model, current_user: User):
    """Filter query by user_id. Admin sees all, others see only their own data."""
    if current_user.role == "admin":
        return query
    return query.filter(model.user_id == current_user.id)


def apply_document_filter(query, model, current_user: User):
    """Filter documents: base docs (user_id=NULL) visible to all, personal docs only to owner. Admin sees all."""
    if current_user.role == "admin":
        return query
    from sqlalchemy import or_
    return query.filter(or_(model.user_id == None, model.user_id == current_user.id))
