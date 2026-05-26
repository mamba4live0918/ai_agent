"""
Real-time voice AI WebSocket endpoint.

Receives PCM 16-bit mono 8 kHz audio chunks via WebSocket and returns
streaming ASR transcriptions in real time.

Authentication is performed via a ``?token=xxx`` query parameter on the
WebSocket handshake using the existing JWT infrastructure.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError

from ..database import SessionLocal
from ..models.user import User
from ..services.realtime_asr import StreamingTranscriber
from ..utils.auth import decode_access_token

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
        sample_rate=8000,
        vad_threshold=0.5,
        min_speech_duration_ms=500,
        enable_speaker_clustering=True,
    )

    # ---- Step 4: process audio chunks --------------------------------------
    try:
        while True:
            # Block until the next binary frame arrives.  ``receive_bytes``
            # raises WebSocketDisconnect when the client goes away.
            audio_bytes: bytes = await websocket.receive_bytes()

            if not audio_bytes:
                continue

            # Feed the chunk through the VAD + ASR pipeline
            try:
                segments = transcriber.feed_chunk(audio_bytes)
            except Exception:
                logger.exception(
                    "Transcription failure for user=%s at stream offset %.1f s",
                    user_id, transcriber.total_seconds,
                )
                await _send_error(websocket, "Transcription processing failed")
                continue

            # Emit a JSON message for each completed segment
            for seg in segments:
                await websocket.send_json(
                    {
                        "type": "transcript",
                        "start": seg.start,
                        "end": seg.end,
                        "text": seg.text,
                        "confidence": seg.confidence,
                        "speaker": seg.speaker,
                        "is_partial": False,
                    }
                )

    except WebSocketDisconnect:
        logger.info("Realtime session disconnected: user=%s", user_id)
    except Exception:
        logger.exception(
            "Unexpected error in realtime session: user=%s", user_id
        )
    finally:
        # ---- Step 5: cleanup -----------------------------------------------
        try:
            transcriber.reset()
        except Exception:
            pass
        logger.info("Realtime session cleaned up: user=%s", user_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _send_error(websocket: WebSocket, message: str) -> None:
    """Send a structured error frame to the client (best-effort)."""
    try:
        await websocket.send_json({"type": "error", "message": message})
    except Exception:
        pass
