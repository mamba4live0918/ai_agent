import io
import csv
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from ..database import get_db
from ..models.user import User
from ..models.group import Group
from ..models.training import TrainingSession, TrainingReview
from ..utils.auth import get_current_user, require_instructor
from ..schemas.instructor import TrainingStatsOverview, PerUserStats, TrainingTrendPoint

router = APIRouter(dependencies=[Depends(require_instructor)])


def _get_relevant_user_ids(current_user: User, db: Session) -> list:
    """Get user IDs relevant to the current instructor's scope."""
    if current_user.role == "admin" and current_user.group_id is None:
        # Super admin sees all
        return None
    # Get all groups administered by this instructor
    admin_group_ids = [g[0] for g in db.query(Group.id).filter(Group.admin_id == current_user.id).all()]
    if admin_group_ids:
        # Instructor sees members of their administered groups + self
        users = db.query(User.id).filter(
            User.group_id.in_(admin_group_ids) | (User.id == current_user.id)
        ).all()
        return [u[0] for u in users]
    if current_user.group_id:
        users = db.query(User.id).filter(
            (User.group_id == current_user.group_id) | (User.id == current_user.id)
        ).all()
        return [u[0] for u in users]
    # Regular instructor sees only self
    return [current_user.id]


@router.get("/statistics/overview", response_model=TrainingStatsOverview)
def get_overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_ids = _get_relevant_user_ids(current_user, db)

    user_query = db.query(func.count(User.id))
    session_query = db.query(func.count(TrainingSession.id))
    if user_ids is not None:
        user_query = user_query.filter(User.id.in_(user_ids))
        session_query = session_query.filter(TrainingSession.user_id.in_(user_ids))

    total_users = user_query.scalar()
    total_sessions = session_query.scalar()
    completed_sessions = session_query.filter(TrainingSession.status == "completed").scalar()
    active_sessions = session_query.filter(TrainingSession.status == "active").scalar()

    completion_rate = (completed_sessions / total_sessions * 100) if total_sessions > 0 else 0.0

    review_query = db.query(TrainingReview).join(TrainingSession, TrainingSession.id == TrainingReview.session_id)
    if user_ids is not None:
        review_query = review_query.filter(TrainingSession.user_id.in_(user_ids))
    reviews = review_query.all()
    overall_scores = [r.scores.get("overall") for r in reviews if isinstance(r.scores, dict) and r.scores.get("overall") is not None]
    avg_score = sum(overall_scores) / len(overall_scores) if overall_scores else None

    return TrainingStatsOverview(
        total_users=total_users,
        total_sessions=total_sessions,
        completed_sessions=completed_sessions,
        active_sessions=active_sessions,
        completion_rate=round(completion_rate, 1),
        average_score=round(avg_score, 1) if avg_score else None,
    )


@router.get("/statistics/per-user", response_model=list[PerUserStats])
def get_per_user_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_ids = _get_relevant_user_ids(current_user, db)
    query = db.query(User)
    if user_ids is not None:
        query = query.filter(User.id.in_(user_ids))
    users = query.all()
    result = []
    for u in users:
        sessions = db.query(TrainingSession).filter(TrainingSession.user_id == u.id)
        total = sessions.count()
        completed = sessions.filter(TrainingSession.status == "completed").count()
        completed_ids = [r[0] for r in sessions.filter(TrainingSession.status == "completed").with_entities(TrainingSession.id).all()]
        avg_score = None
        if completed_ids:
            reviews = db.query(TrainingReview).filter(TrainingReview.session_id.in_(completed_ids)).all()
            scores = [r.scores.get("overall") for r in reviews if isinstance(r.scores, dict) and r.scores.get("overall") is not None]
            avg_score = sum(scores) / len(scores) if scores else None

        last_session = sessions.order_by(TrainingSession.started_at.desc()).first()
        result.append(PerUserStats(
            user_id=str(u.id),
            username=u.username,
            role=u.role,
            total_sessions=total,
            completed_sessions=completed,
            average_score=round(avg_score, 1) if avg_score else None,
            last_session_at=last_session.started_at.isoformat() if last_session else None,
        ))
    return result


@router.get("/statistics/trends", response_model=list[TrainingTrendPoint])
def get_trends(
    granularity: str = Query("weekly", pattern="^(weekly|monthly)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_ids = _get_relevant_user_ids(current_user, db)
    query = db.query(TrainingSession).order_by(TrainingSession.started_at)
    if user_ids is not None:
        query = query.filter(TrainingSession.user_id.in_(user_ids))
    sessions = query.all()

    if not sessions:
        return []

    start_date = sessions[0].started_at
    end_date = datetime.utcnow()

    buckets = {}
    current = start_date

    if granularity == "weekly":
        while current <= end_date:
            week_end = current + timedelta(days=7)
            bucket_sessions = [
                s for s in sessions
                if s.started_at >= current and s.started_at < week_end
            ]
            key = current.strftime("%Y-%m-%d")
            completed = [s for s in bucket_sessions if s.status == "completed"]

            avg_score = None
            if completed:
                ids = [s.id for s in completed]
                reviews = db.query(TrainingReview).filter(TrainingReview.session_id.in_(ids)).all()
                scores_list = [r.scores.get("overall") for r in reviews if isinstance(r.scores, dict) and r.scores.get("overall") is not None]
                avg_score = round(sum(scores_list) / len(scores_list), 1) if scores_list else None

            buckets[key] = TrainingTrendPoint(
                period=key,
                total_sessions=len(bucket_sessions),
                completed_sessions=len(completed),
                average_score=avg_score,
            )
            current = week_end
    else:
        # monthly
        current_month = start_date.replace(day=1)
        while current_month <= end_date:
            if current_month.month == 12:
                next_month = current_month.replace(year=current_month.year + 1, month=1)
            else:
                next_month = current_month.replace(month=current_month.month + 1)

            bucket_sessions = [
                s for s in sessions
                if s.started_at >= current_month and s.started_at < next_month
            ]
            key = current_month.strftime("%Y-%m")
            completed = [s for s in bucket_sessions if s.status == "completed"]

            avg_score = None
            if completed:
                ids = [s.id for s in completed]
                reviews = db.query(TrainingReview).filter(TrainingReview.session_id.in_(ids)).all()
                scores_list = [r.scores.get("overall") for r in reviews if isinstance(r.scores, dict) and r.scores.get("overall") is not None]
                avg_score = round(sum(scores_list) / len(scores_list), 1) if scores_list else None

            buckets[key] = TrainingTrendPoint(
                period=key,
                total_sessions=len(bucket_sessions),
                completed_sessions=len(completed),
                average_score=avg_score,
            )
            current_month = next_month

    return list(buckets.values())


@router.get("/reports/export")
def export_report(format: str = Query("csv", pattern="^(csv)$"), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_ids = _get_relevant_user_ids(current_user, db)
    query = db.query(TrainingSession).order_by(TrainingSession.started_at.desc())
    if user_ids is not None:
        query = query.filter(TrainingSession.user_id.in_(user_ids))
    sessions = query.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "会话ID", "用户ID", "客户ID", "场景", "状态",
        "开始时间", "完成时间", "消息数", "综合评分",
        "表达逻辑", "专业准确度", "情绪情商",
    ])

    for s in sessions:
        message_count = len(s.messages) if s.messages else 0
        review_scores = {}
        if s.review:
            review_scores = s.review.scores or {}
        writer.writerow([
            str(s.id), str(s.user_id), str(s.customer_id) if s.customer_id else "",
            s.scenario, s.status,
            s.started_at.isoformat() if s.started_at else "",
            s.completed_at.isoformat() if s.completed_at else "",
            message_count,
            review_scores.get("overall", ""),
            review_scores.get("表达逻辑", ""),
            review_scores.get("专业准确度", ""),
            review_scores.get("情绪情商", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=training_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"},
    )


# ── Student Management ──

@router.get("/students/available")
def get_available_students(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return ungrouped users that an instructor can claim."""
    if current_user.role == "admin" and not current_user.group_id:
        # Super admin: show all ungrouped users
        users = db.query(User).filter(User.group_id == None).all()
    elif current_user.group_id:
        # Group admin/instructor: show ungrouped users + their group members
        users = db.query(User).filter(
            (User.group_id == None) | (User.group_id == current_user.group_id)
        ).all()
    else:
        return []

    return [{
        "id": str(u.id),
        "username": u.username,
        "email": u.email or "",
        "role": u.role,
        "group_id": str(u.group_id) if u.group_id else None,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users]


@router.post("/students/claim/{user_id}")
def claim_student(user_id: uuid.UUID, group_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Instructor claims an ungrouped user into a specific group they administer."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Group not found")
    if group.admin_id != current_user.id and not (current_user.role == "admin" and current_user.group_id is None):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="You don't administer this group")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    if user.group_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="User already belongs to a group")

    user.group_id = group_id
    db.commit()
    return {"detail": f"User {user.username} claimed into group {group.name}"}


@router.post("/students/release/{user_id}")
def release_student(user_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Instructor releases a user from any group they administer."""
    # Find groups administered by this instructor
    admin_groups = db.query(Group.id).filter(Group.admin_id == current_user.id).all()
    if not admin_groups and not (current_user.role == "admin" and current_user.group_id is None):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="You don't administer any groups")

    group_ids = [g[0] for g in admin_groups]
    user = db.query(User).filter(User.id == user_id, User.group_id.in_(group_ids)).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found in any of your groups")

    user.group_id = None
    db.commit()
    return {"detail": f"User {user.username} released from your group"}
