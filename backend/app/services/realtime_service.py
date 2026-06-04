"""
Real-time voice session archiving.

Provides helpers to persist a completed real-time session and its transcription
segments in bulk after the WebSocket connection closes.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.realtime_session import RealtimeSession, RealtimeSegment, RealtimeCoachEvent


def archive_session(
    db: Session,
    user_id: str,
    segments: list[dict],
    speaker_count: int = 0,
    coach_events: list[dict] | None = None,
) -> str:
    """Persist a completed real-time session with all its transcription segments
    and coach events.

    Parameters
    ----------
    db:
        An active SQLAlchemy session (caller is responsible for committing).
    user_id:
        The UUID of the authenticated user who owns the session.
    segments:
        A list of segment dicts, each containing ``start``, ``end``, ``text``,
        ``speaker``, and ``confidence`` keys.
    speaker_count:
        The number of unique speakers detected in the session (0 if no speaker
        diarization was performed).
    coach_events:
        Optional list of coach event dicts, each containing ``trigger_rule``,
        ``coach_content``, and optionally ``segment_id``.

    Returns
    -------
    str
        The UUID (as a string) of the newly created ``RealtimeSession``.
    """
    session = RealtimeSession(
        user_id=uuid.UUID(user_id),
        status="completed",
        speaker_count=speaker_count,
        started_at=datetime.utcnow(),  # caller can override if original start is known
        ended_at=datetime.utcnow(),
    )
    db.add(session)
    db.flush()  # populate session.id before creating child rows

    for seg in segments:
        asr_model = "funasr-paraformer-zh-streaming"
        if seg.get("calibrated"):
            asr_model = "funasr-nano-calibrated"
        db.add(
            RealtimeSegment(
                session_id=session.id,
                start=seg.get("start", 0.0),
                end=seg.get("end", 0.0),
                text=seg.get("text", ""),
                speaker=seg.get("speaker", ""),
                confidence=seg.get("confidence", 0.0),
                asr_model=asr_model,
            )
        )

    # Persist coach events if any
    if coach_events:
        for evt in coach_events:
            db.add(
                RealtimeCoachEvent(
                    session_id=session.id,
                    trigger_rule=evt.get("trigger_rule", "unknown"),
                    coach_content=evt.get("coach_content", ""),
                    segment_id=evt.get("segment_id"),
                )
            )

    return str(session.id)
