import io
import csv
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from ..database import get_db
from ..models.user import User
from ..models.training import TrainingSession, TrainingReview
from ..utils.auth import get_current_user, require_instructor
from ..schemas.instructor import TrainingStatsOverview, PerUserStats, TrainingTrendPoint

router = APIRouter(dependencies=[Depends(require_instructor)])


@router.get("/statistics/overview", response_model=TrainingStatsOverview)
def get_overview(db: Session = Depends(get_db)):
    total_users = db.query(func.count(User.id)).scalar()
    total_sessions = db.query(func.count(TrainingSession.id)).scalar()
    completed_sessions = db.query(func.count(TrainingSession.id)).filter(
        TrainingSession.status == "completed"
    ).scalar()
    active_sessions = db.query(func.count(TrainingSession.id)).filter(
        TrainingSession.status == "active"
    ).scalar()

    completion_rate = (completed_sessions / total_sessions * 100) if total_sessions > 0 else 0.0

    reviews = db.query(TrainingReview).join(TrainingSession, TrainingSession.id == TrainingReview.session_id).all()
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
def get_per_user_stats(db: Session = Depends(get_db)):
    users = db.query(User).all()
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
):
    sessions = db.query(TrainingSession).order_by(TrainingSession.started_at).all()

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
def export_report(format: str = Query("csv", pattern="^(csv)$"), db: Session = Depends(get_db)):
    sessions = db.query(TrainingSession).order_by(TrainingSession.started_at.desc()).all()

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
