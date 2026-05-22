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


def _min_audio_size() -> int:
    """Minimum audio file size in bytes to be considered valid (webm header is ~1KB)."""
    return 4096


def _convert_to_wav(audio_path: str) -> str:
    """Convert audio to WAV using pydub (via ffmpeg). Returns path to WAV file.
    pydub works around torchcodec issues with webm duration on Windows."""
    from pydub import AudioSegment
    wav_path = audio_path.rsplit(".", 1)[0] + "_converted.wav"
    audio = AudioSegment.from_file(audio_path)
    audio.export(wav_path, format="wav")
    return wav_path


def save_audio_file(uploaded_file, user_id: str) -> tuple[str, float]:
    """Save uploaded audio to user-scoped directory. Returns (filepath, duration_seconds)."""
    user_dir = _ensure_audio_dir(user_id)
    filename = f"{uuid.uuid4()}.webm"
    filepath = os.path.join(user_dir, filename)
    content = uploaded_file.file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    return filepath, 0.0


def process_conversation_audio(conversation_id: uuid.UUID, user_id: str, db: Session) -> SalesConversation:
    """Full pipeline: convert → diarize → transcribe → analyze → save.

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

    file_size = os.path.getsize(conv.audio_file_path)
    if file_size < _min_audio_size():
        conv.status = "failed"
        conv.error_message = f"Audio file too small ({file_size} bytes). Please record at least 1 second of audio."
        db.commit()
        return conv

    conv.status = "processing"
    conv.error_message = None
    db.commit()

    wav_path = None
    try:
        # Step 0: Convert to WAV for reliable torchcodec processing
        wav_path = _convert_to_wav(conv.audio_file_path)

        # Step 1: Speaker diarization
        processor = get_voice_processor()
        diarization_segments = processor.diarize(wav_path)

        # Step 2: Transcription aligned with diarization
        transcribed_segments = processor.transcribe(wav_path, diarization_segments)

        # Step 3: Save individual messages
        for seg in transcribed_segments:
            msg = ConversationMessage(
                conversation_id=conv.id,
                speaker=seg.get("speaker", "未知"),
                content=seg.get("text", ""),
                start_time=float(seg.get("start", 0)),
                end_time=float(seg.get("end", 0)),
                confidence=float(seg["confidence"]) if seg.get("confidence") is not None else None,
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
        import traceback
        db.rollback()
        conv.status = "failed"
        conv.error_message = f"{exc}\n\n{traceback.format_exc()}"
        db.commit()

    finally:
        # Clean up temporary WAV file
        if wav_path and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except OSError:
                pass

    db.refresh(conv)
    return conv
