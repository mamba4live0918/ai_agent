import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..database import Base


class TrainingSession(Base):
    __tablename__ = "training_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    persona: Mapped[dict] = mapped_column(JSONB, nullable=False)
    scenario: Mapped[str] = mapped_column(String(50), nullable=False)
    scenario_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    coach_suggestions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    messages: Mapped[list["TrainingMessage"]] = relationship("TrainingMessage", back_populates="session", cascade="all, delete-orphan", order_by="TrainingMessage.created_at")
    review: Mapped["TrainingReview | None"] = relationship("TrainingReview", back_populates="session", cascade="all, delete-orphan", uselist=False)


class TrainingMessage(Base):
    __tablename__ = "training_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("training_sessions.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    coach_tip: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["TrainingSession"] = relationship("TrainingSession", back_populates="messages")


class TrainingReview(Base):
    __tablename__ = "training_reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("training_sessions.id", ondelete="CASCADE"), unique=True, nullable=False)
    scores: Mapped[dict] = mapped_column(JSONB, nullable=False)
    dimension_scores: Mapped[dict] = mapped_column(JSONB, nullable=False)
    overall_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    weakness_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    highlights: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    next_steps: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["TrainingSession"] = relationship("TrainingSession", back_populates="review")
