"""Cloud voice processor placeholder — reserved for Alibaba/Xunfei real-time ASR integration."""


class CloudVoiceProcessor:
    def __init__(self):
        from ..config import settings
        self.mode = settings.voice_processor_mode
        # Future: read API credentials from settings

    def diarize(self, audio_path: str) -> list[dict]:
        raise NotImplementedError(
            "Cloud diarization not yet implemented. "
            "Set voice_processor_mode=local or configure cloud API credentials."
        )

    def transcribe(self, audio_path: str, diarization_segments: list[dict]) -> list[dict]:
        raise NotImplementedError(
            "Cloud transcription not yet implemented. "
            "Set voice_processor_mode=local or configure cloud API credentials."
        )
