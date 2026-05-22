"""Voice processor abstraction layer — Protocol + factory for switching local/cloud STT."""

from typing import Protocol, runtime_checkable


@runtime_checkable
class VoiceProcessor(Protocol):
    """Structural protocol for voice processing implementations.
    Any object with diarize() and transcribe() methods satisfies this protocol."""

    def diarize(self, audio_path: str) -> list[dict]:
        """Identify speakers and their time segments.
        Returns [{"speaker": "SPEAKER_00", "start": 0.0, "end": 1.23}, ...]"""
        ...

    def transcribe(self, audio_path: str, diarization_segments: list[dict]) -> list[dict]:
        """Transcribe speech, aligning with diarization segments.
        Returns [{"speaker": "销售", "start": 0.0, "end": 1.2, "text": "...", "confidence": 0.95}, ...]"""
        ...


def get_voice_processor() -> VoiceProcessor:
    from ..config import settings

    if settings.voice_processor_mode == "cloud":
        from .cloud_voice_processor import CloudVoiceProcessor
        return CloudVoiceProcessor()
    from .local_voice_processor import LocalVoiceProcessor
    return LocalVoiceProcessor()
