import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.feedback import Feedback
from ..models.user import User
from ..schemas.feedback import FeedbackCreate, FeedbackResponse, FeedbackStats, FeedbackAdminResponse, FeedbackAdminList
from ..utils.auth import get_current_user, require_admin

router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse, status_code=201)
def submit_feedback(data: FeedbackCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    fb = Feedback(
        user_id=current_user.id,
        rating=data.rating,
        feedback_text=data.feedback_text,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return FeedbackResponse.model_validate(fb)


@router.get("/feedback/my", response_model=list[FeedbackResponse])
def my_feedback(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    fbs = db.query(Feedback).filter(Feedback.user_id == current_user.id).order_by(Feedback.created_at.desc()).limit(20).all()
    return [FeedbackResponse.model_validate(f) for f in fbs]


@router.get("/feedback/stats", response_model=FeedbackStats)
def feedback_stats(db: Session = Depends(get_db)):
    total = db.query(func.count(Feedback.id)).scalar() or 0
    avg_row = db.query(func.avg(Feedback.rating)).scalar()
    average = round(float(avg_row), 2) if avg_row else 0.0

    dist_rows = db.query(Feedback.rating, func.count(Feedback.id)).group_by(Feedback.rating).all()
    distribution = {r: 0 for r in range(1, 6)}
    for rating, cnt in dist_rows:
        distribution[rating] = cnt

    return FeedbackStats(total=total, average=average, distribution=distribution)


@router.get("/feedback/all", response_model=FeedbackAdminList, dependencies=[Depends(require_admin)])
def admin_all_feedback(page: int = 1, page_size: int = 20, db: Session = Depends(get_db)):
    offset = (page - 1) * page_size
    total = db.query(func.count(Feedback.id)).scalar() or 0
    rows = (
        db.query(Feedback, User.username)
        .join(User, Feedback.user_id == User.id)
        .order_by(Feedback.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    items = []
    for fb, username in rows:
        item = FeedbackAdminResponse(
            id=fb.id,
            user_id=fb.user_id,
            rating=fb.rating,
            feedback_text=fb.feedback_text,
            created_at=fb.created_at,
            username=username,
        )
        items.append(item)
    return FeedbackAdminList(items=items, total=total)
