"""
Realtime voice session ORM models.

RealtimeSession — top-level container for a real-time voice conversation.
RealtimeSegment — individual transcription segment produced by the ASR pipeline.
RealtimeCoachEvent — coach tip triggered by a rule during a live session (Phase 3).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Float, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from ..database import Base


class RealtimeSession(Base):
    __tablename__ = "realtime_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active",
    )  # active, completed, abandoned
    speaker_count: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    segments: Mapped[list["RealtimeSegment"]] = relationship(
        "RealtimeSegment",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="RealtimeSegment.start",
    )
    coach_events: Mapped[list["RealtimeCoachEvent"]] = relationship(
        "RealtimeCoachEvent",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="RealtimeCoachEvent.created_at",
        foreign_keys="[RealtimeCoachEvent.session_id]",
    )


class RealtimeSegment(Base):
    __tablename__ = "realtime_segments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("realtime_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start: Mapped[float] = mapped_column(Float, nullable=False)
    end: Mapped[float] = mapped_column(Float, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    speaker: Mapped[str] = mapped_column(String(50), default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    asr_model: Mapped[str] = mapped_column(
        String(100), default="faster-whisper-large-v3-turbo",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["RealtimeSession"] = relationship(
        "RealtimeSession", back_populates="segments",
    )


class RealtimeCoachEvent(Base):
    """Coaching tips that fire during a live real-time session (Phase 3).

    Each event is keyed to a trigger rule (e.g. ``silence_60s``,
    ``objection_detected``) and may optionally reference the segment that
    triggered it.
    """

    __tablename__ = "realtime_coach_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("realtime_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trigger_rule: Mapped[str] = mapped_column(String(100), nullable=False)
    coach_content: Mapped[str] = mapped_column(Text, nullable=False)
    segment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("realtime_segments.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["RealtimeSession"] = relationship(
        "RealtimeSession",
        back_populates="coach_events",
        foreign_keys=[session_id],
    )
    segment: Mapped["RealtimeSegment | None"] = relationship(
        "RealtimeSegment",
        foreign_keys=[segment_id],
    )
