import uuid
import math
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.group import Group
from ..schemas.group import (
    GroupCreate, GroupUpdate, GroupResponse,
    GroupMemberResponse, GroupListResponse,
)
from ..utils.auth import get_current_user, require_admin

router = APIRouter(dependencies=[Depends(require_admin)])


def _is_super_admin(user: User) -> bool:
    return user.role == "admin" and user.group_id is None


def _is_group_admin(user: User, group: Group) -> bool:
    return user.role == "admin" and group.admin_id == user.id


def _check_super_or_group_admin(user: User, group: Group):
    if not _is_super_admin(user) and not _is_group_admin(user, group):
        raise HTTPException(status_code=403, detail="Only super admin or group admin can manage this group")


def _group_to_response(group: Group, db: Session) -> GroupResponse:
    admin_name = None
    if group.admin_id:
        admin = db.query(User).filter(User.id == group.admin_id).first()
        admin_name = admin.username if admin else None
    member_count = db.query(User).filter(User.group_id == group.id).count()
    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        admin_id=group.admin_id,
        admin_name=admin_name,
        member_count=member_count,
        created_at=group.created_at,
    )


@router.post("/groups", response_model=GroupResponse, status_code=201)
def create_group(
    data: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Only super admin can create groups")
    if db.query(Group).filter(Group.name == data.name).first():
        raise HTTPException(status_code=409, detail="Group name already taken")
    group = Group(
        name=data.name,
        description=data.description,
        admin_id=data.admin_id,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    # If admin_id specified, auto-assign admin to the group
    if data.admin_id:
        admin_user = db.query(User).filter(User.id == data.admin_id).first()
        if admin_user and admin_user.group_id is None:
            admin_user.group_id = group.id
            db.commit()
    return _group_to_response(group, db)


@router.get("/groups", response_model=GroupListResponse)
def list_groups(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _is_super_admin(current_user):
        query = db.query(Group)
    else:
        # Group admin only sees their own groups
        query = db.query(Group).filter(Group.admin_id == current_user.id)

    total = query.count()
    offset = (page - 1) * page_size
    groups = query.order_by(Group.created_at.desc()).offset(offset).limit(page_size).all()
    items = [_group_to_response(g, db) for g in groups]
    return GroupListResponse(items=items, total=total)


@router.patch("/groups/{group_id}", response_model=GroupResponse)
def update_group(
    group_id: uuid.UUID,
    data: GroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _check_super_or_group_admin(current_user, group)

    if data.name is not None:
        existing = db.query(Group).filter(Group.name == data.name, Group.id != group_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Group name already taken")
        group.name = data.name
    if data.description is not None:
        group.description = data.description
    if data.admin_id is not None and _is_super_admin(current_user):
        # Only super admin can change group admin
        group.admin_id = data.admin_id

    db.commit()
    db.refresh(group)
    return _group_to_response(group, db)


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(
    group_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Only super admin can delete groups")
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    # Unlink members
    db.query(User).filter(User.group_id == group_id).update({User.group_id: None})
    db.delete(group)
    db.commit()


@router.get("/groups/{group_id}/members", response_model=list[GroupMemberResponse])
def list_members(
    group_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _check_super_or_group_admin(current_user, group)
    members = db.query(User).filter(User.group_id == group_id).order_by(User.created_at.desc()).all()
    return [GroupMemberResponse.model_validate(m) for m in members]


@router.post("/groups/{group_id}/members/{user_id}", response_model=GroupMemberResponse)
def add_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _check_super_or_group_admin(current_user, group)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin" and user.group_id is None:
        raise HTTPException(status_code=400, detail="Cannot add super admin to a group")
    user.group_id = group_id
    db.commit()
    db.refresh(user)
    return GroupMemberResponse.model_validate(user)


@router.delete("/groups/{group_id}/members/{user_id}", status_code=204)
def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _check_super_or_group_admin(current_user, group)

    user = db.query(User).filter(User.id == user_id, User.group_id == group_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not in this group")
    user.group_id = None
    db.commit()
