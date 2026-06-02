import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.auth import UserRegister, UserLogin, UserResponse, TokenResponse, RoleUpdateRequest, UserListResponse
from ..utils.auth import hash_password, verify_password, create_access_token, get_current_user, require_admin, require_instructor, require_super_admin
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


@router.put("/profile")
def update_profile(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Update current user's profile (username, email, password, bio, avatar)."""
    if 'username' in data and data['username'] != current_user.username:
        existing = db.query(User).filter(User.username == data['username']).first()
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken")
        current_user.username = data['username']
    if 'email' in data:
        current_user.email = data['email']
    if 'password' in data and data['password']:
        current_user.hashed_password = hash_password(data['password'])
    if 'bio' in data:
        val = (data['bio'] or '')[:100]
        current_user.bio = val if val else None
    if 'avatar' in data:
        val = (data['avatar'] or '')[:500]
        current_user.avatar = val if val else None
    if 'status' in data:
        current_user.status = data['status'] if data['status'] else None
    db.commit()
    return {"username": current_user.username, "email": current_user.email, "bio": current_user.bio, "avatar": current_user.avatar, "status": current_user.status}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/users/{user_id}")
def get_user_detail(user_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get detailed info about a user, including groups they administer."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get groups administered by this user
    from ..models.group import Group as GroupModel
    admin_groups = db.query(GroupModel).filter(GroupModel.admin_id == user_id).all()
    admin_groups_data = [{
        "id": str(g.id), "name": g.name, "description": g.description,
        "member_count": db.query(User).filter(User.group_id == g.id).count(),
    } for g in admin_groups]

    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "group_id": str(user.group_id) if user.group_id else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "administered_groups": admin_groups_data,
    }


@router.get("/users", response_model=UserListResponse, dependencies=[Depends(require_instructor)])
def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offset = (page - 1) * page_size
    query = db.query(User)
    if current_user.role == "admin" and current_user.group_id is None:
        # Super admin sees all users
        pass
    else:
        # Teachers/group admins: show ungrouped salespeople + members of groups they administer
        from ..models.group import Group
        admin_group_ids = [g[0] for g in db.query(Group.id).filter(Group.admin_id == current_user.id).all()]
        if admin_group_ids:
            query = query.filter(User.role == "salesperson").filter(
                User.group_id.in_(admin_group_ids) | (User.group_id == None)
            )
        else:
            query = query.filter(User.role == "salesperson").filter(User.group_id == None)
    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(offset).limit(page_size).all()
    return UserListResponse(items=[UserResponse.model_validate(u) for u in users], total=total)


@router.patch("/users/{user_id}/role", response_model=UserResponse, dependencies=[Depends(require_super_admin)])
def update_user_role(
    user_id: str,
    data: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.role not in ("admin", "instructor", "salesperson"):
        raise HTTPException(status_code=400, detail="Invalid role")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    user.role = data.role
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/users", status_code=201, response_model=UserResponse, dependencies=[Depends(require_super_admin)])
def admin_create_user(data: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
        role=data.role or "salesperson",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/users/{user_id}", status_code=204, dependencies=[Depends(require_super_admin)])
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete an admin user")
    db.delete(user)
    db.commit()
    return None
