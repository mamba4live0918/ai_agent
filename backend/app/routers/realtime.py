"""
Real-time voice AI WebSocket endpoint.

Receives PCM 16-bit mono 8 kHz audio chunks via WebSocket and returns
streaming ASR transcriptions in real time.

Authentication is performed via a ``?token=xxx`` query parameter on the
WebSocket handshake using the existing JWT infrastructure.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models.user import User
from ..models.realtime_session import RealtimeSession, RealtimeSegment
from ..services.realtime_asr import StreamingTranscriber
from ..services.realtime_service import archive_session
from ..utils.auth import decode_access_token, get_current_user, apply_user_filter

logger = logging.getLogger(__name__)

router = APIRouter()

# RFC 6455 close codes: 4000-4999 are reserved for application use.
WS_CLOSE_UNAUTHORIZED = 4001
WS_CLOSE_FORBIDDEN = 4003


@router.websocket("/ws/realtime/session")
async def realtime_session(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token for authentication"),
) -> None:
    """Real-time audio streaming and transcription WebSocket endpoint.

    Authentication
    --------------
    Pass a valid JWT access token as a query parameter::

        ws://localhost:8000/ws/realtime/session?token=<jwt>

    If the token is missing, expired, or belongs to a deleted user the
    connection is rejected with a WebSocket close code of 4003.

    Protocol
    --------
    **Client → Server**: Raw PCM 16-bit mono audio at 8 kHz sent as binary
    frames.  There is no framing header — every binary message is treated as
    a contiguous chunk of samples.

    **Server → Client**: JSON text frames with the following shapes:

    *Transcript* ::

        {
          "type": "transcript",
          "start": 0.5,
          "end": 2.3,
          "text": "你好，我想了解...",
          "confidence": 0.95,
          "is_partial": false
        }

    *Error* ::

        {"type": "error", "message": "..."}

    Lifecycle
    ---------
    - A new :class:`StreamingTranscriber` is created per connection.
    - Audio chunks are fed incrementally via :meth:`StreamingTranscriber.feed_chunk`.
    - Completed transcription segments are sent immediately as JSON.
    - On disconnect (including normal tab-close) the transcriber is reset
      and cleaned up.
    """
    # ---- Step 1: authenticate the JWT token --------------------------------
    try:
        payload = decode_access_token(token)
    except JWTError:
        logger.warning("Realtime session auth failed: invalid or expired token")
        await websocket.close(code=WS_CLOSE_FORBIDDEN)
        return

    user_id = payload.get("user_id")
    if user_id is None:
        logger.warning("Realtime session auth failed: payload missing user_id")
        await websocket.close(code=WS_CLOSE_FORBIDDEN)
        return

    # Verify the user still exists in the database
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
    finally:
        db.close()

    if user is None:
        logger.warning("Realtime session auth failed: user not found (id=%s)", user_id)
        await websocket.close(code=WS_CLOSE_FORBIDDEN)
        return

    # ---- Step 2: accept the WebSocket connection ----------------------------
    await websocket.accept()
    logger.info(
        "Realtime session connected  user=%s  id=%s  role=%s",
        user.username, user_id, user.role,
    )

    # ---- Step 3: create the transcription pipeline -------------------------
    transcriber = StreamingTranscriber(
        sample_rate=16000,
        vad_threshold=0.5,
        min_speech_duration_ms=1000,
        max_speech_duration_s=8.0,
        enable_speaker_clustering=True,
    )

    # ---- Step 4: process audio chunks --------------------------------------
    loop = asyncio.get_running_loop()
    accumulated_segments: list[dict] = []
    speaker_ids: set[str] = set()
    session_started_at = datetime.utcnow()

    # Notify client of the new session ID (generated client-side for now;
    # we'll create the DB record on disconnect).
    session_id = str(uuid.uuid4())
    await websocket.send_json({"type": "session_start", "session_id": session_id})

    try:
        while True:
            audio_bytes: bytes = await websocket.receive_bytes()

            if not audio_bytes:
                continue

            try:
                segments = await loop.run_in_executor(
                    None, transcriber.feed_chunk, audio_bytes
                )
            except Exception:
                logger.exception(
                    "Transcription failure for user=%s at stream offset %.1f s",
                    user_id, transcriber.total_seconds,
                )
                await _send_error(websocket, "Transcription processing failed")
                continue

            for seg in segments:
                speaker_name = transcriber.get_speaker_names().get(
                    seg.speaker, seg.speaker
                )
                seg_dict = {
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text,
                    "speaker": seg.speaker,
                    "speaker_name": speaker_name,
                    "confidence": seg.confidence,
                }
                accumulated_segments.append(seg_dict)
                if seg.speaker:
                    speaker_ids.add(seg.speaker)

                logger.info(
                    "Emitting transcript: %.1fs-%.1fs speaker=%s (%s) text=%s",
                    seg.start, seg.end, seg.speaker, speaker_name, seg.text[:80],
                )
                await websocket.send_json({
                    "type": "transcript",
                    **seg_dict,
                    "session_id": session_id,
                    "is_partial": False,
                })

    except WebSocketDisconnect:
        logger.info("Realtime session disconnected: user=%s", user_id)
    except Exception:
        logger.exception("Unexpected error in realtime session: user=%s", user_id)
    finally:
        # ---- Step 5: archive session & cleanup -----------------------------
        try:
            transcriber.reset()
        except Exception:
            pass

        if accumulated_segments:
            db_archive = SessionLocal()
            try:
                sid = archive_session(
                    db_archive,
                    user_id=user_id,
                    segments=accumulated_segments,
                    speaker_count=len(speaker_ids),
                )
                # Override the generated start/end times with actual values
                s = db_archive.query(RealtimeSession).filter(
                    RealtimeSession.id == sid
                ).first()
                if s:
                    s.started_at = session_started_at
                    s.ended_at = datetime.utcnow()
                    db_archive.commit()
                logger.info(
                    "Session archived: id=%s segments=%d speakers=%d",
                    sid, len(accumulated_segments), len(speaker_ids),
                )
            except Exception:
                logger.exception("Failed to archive session for user=%s", user_id)
            finally:
                db_archive.close()

        logger.info("Realtime session cleaned up: user=%s", user_id)


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------


@router.get("/api/realtime/sessions")
def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a paginated list of the current user's real-time sessions.

    Sessions are ordered by ``started_at`` descending (newest first).
    """
    query = apply_user_filter(
        db.query(RealtimeSession), RealtimeSession, current_user
    ).order_by(RealtimeSession.started_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [
            {
                "id": str(s.id),
                "status": s.status,
                "speaker_count": s.speaker_count,
                "segment_count": len(s.segments) if s.segments else 0,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "preview": _session_preview(s),
            }
            for s in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max((total + page_size - 1) // page_size, 1),
    }


@router.delete("/api/realtime/sessions/{session_id}")
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a real-time session and all its segments.

    The caller must own the session.
    """
    session = (
        db.query(RealtimeSession)
        .filter(
            RealtimeSession.id == session_id,
            RealtimeSession.user_id == current_user.id,
        )
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    db.delete(session)
    db.commit()
    return {"detail": "deleted"}


@router.get("/api/realtime/sessions/{session_id}")
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a full real-time session replay including all segments.

    The caller must own the session.  Segments are returned in time order.
    """
    session = (
        db.query(RealtimeSession)
        .filter(
            RealtimeSession.id == session_id,
            RealtimeSession.user_id == current_user.id,
        )
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    segments = (
        db.query(RealtimeSegment)
        .filter(RealtimeSegment.session_id == session_id)
        .order_by(RealtimeSegment.start)
        .all()
    )

    return {
        "session": {
            "id": str(session.id),
            "user_id": str(session.user_id),
            "status": session.status,
            "speaker_count": session.speaker_count,
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "ended_at": session.ended_at.isoformat() if session.ended_at else None,
            "created_at": session.created_at.isoformat() if session.created_at else None,
        },
        "segments": [
            {
                "id": str(seg.id),
                "session_id": str(seg.session_id),
                "start": seg.start,
                "end": seg.end,
                "text": seg.text,
                "speaker": seg.speaker,
                "confidence": seg.confidence,
                "asr_model": seg.asr_model,
                "created_at": seg.created_at.isoformat() if seg.created_at else None,
            }
            for seg in segments
        ],
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _send_error(websocket: WebSocket, message: str) -> None:
    """Send a structured error frame to the client (best-effort)."""
    try:
        await websocket.send_json({"type": "error", "message": message})
    except Exception:
        pass


def _session_preview(session: RealtimeSession) -> str | None:
    """Return the first 80 chars of the first segment's text, or None."""
    if session.segments:
        first = session.segments[0]
        if first.text:
            return first.text[:80]
    return None
