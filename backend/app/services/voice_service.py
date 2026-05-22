"""Voice service — audio file handling and processing pipeline orchestration."""

import os
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from ..config import settings
from ..models.sales_conversation import SalesConversation, ConversationMessage
from ..models.customer import Customer
from .voice_processor import get_voice_processor
from .sales_assistance_service import analyze_conversation


def _ensure_audio_dir(user_id: str) -> str:
    user_dir = os.path.join(settings.audio_upload_dir, user_id)
    os.makedirs(user_dir, exist_ok=True)
    return user_dir


def save_audio_file(uploaded_file, user_id: str) -> tuple[str, float]:
    """Save uploaded audio to user-scoped directory. Returns (filepath, duration_seconds)."""
    user_dir = _ensure_audio_dir(user_id)
    filename = f"{uuid.uuid4()}.webm"
    filepath = os.path.join(user_dir, filename)
    content = uploaded_file.file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    # Duration is estimated later or reported by client
    file_size = len(content)
    return filepath, 0.0


def process_conversation_audio(conversation_id: uuid.UUID, user_id: str, db: Session) -> SalesConversation:
    """Full pipeline: diarize → transcribe → analyze → save.

    Sets status to 'processing' during execution, 'completed' on success,
    or 'failed' on error with error_message populated.
    """
    conv = db.query(SalesConversation).filter(SalesConversation.id == conversation_id).first()
    if not conv:
        raise ValueError(f"Conversation {conversation_id} not found")
    if not conv.audio_file_path or not os.path.exists(conv.audio_file_path):
        conv.status = "failed"
        conv.error_message = "Audio file not found on disk"
        db.commit()
        return conv

    conv.status = "processing"
    db.commit()

    try:
        # Step 1: Speaker diarization
        processor = get_voice_processor()
        diarization_segments = processor.diarize(conv.audio_file_path)

        # Step 2: Transcription aligned with diarization
        transcribed_segments = processor.transcribe(conv.audio_file_path, diarization_segments)

        # Step 3: Save individual messages
        for seg in transcribed_segments:
            msg = ConversationMessage(
                conversation_id=conv.id,
                speaker=seg.get("speaker", "未知"),
                content=seg.get("text", ""),
                start_time=seg.get("start", 0),
                end_time=seg.get("end", 0),
                confidence=seg.get("confidence"),
            )
            db.add(msg)

        # Build segments format for analysis
        segments_for_analysis = [
            {"speaker": s.get("speaker", "未知"), "start": s.get("start", 0),
             "end": s.get("end", 0), "text": s.get("text", ""),
             "confidence": s.get("confidence")}
            for s in transcribed_segments
        ]
        conv.transcription_segments = segments_for_analysis

        # Step 4: LLM analysis
        analysis = analyze_conversation(segments_for_analysis, user_id=user_id)
        conv.analysis_results = analysis

        conv.status = "completed"
        conv.completed_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as exc:
        conv.status = "failed"
        conv.error_message = str(exc)
        db.commit()

    db.refresh(conv)
    return conv
