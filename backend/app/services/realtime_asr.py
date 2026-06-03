"""
Real-time ASR pipeline: FunASR fsmn-vad + paraformer-zh streaming transcription.

Architecture
------------
Audio chunks flow through three stages:
1. VADProcessor   — buffers PCM audio, runs FunASR fsmn-vad,
                     emits complete speech segments with timestamps
2. ASRProcessor    — transcribes audio segments via FunASR paraformer-zh (220M)
3. StreamingTranscriber — orchestrates 1+2, optional pyannote secondary VAD check

All classes accept raw PCM 16-bit mono audio bytes and follow the project
conventions established in post_sales_service.py.
"""

from __future__ import annotations

import io
import logging
import wave
from dataclasses import dataclass

from ..config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class VADSegment:
    """A speech segment detected by the VAD processor."""

    start: float  # seconds from stream start
    end: float  # seconds from stream start
    audio_bytes: bytes  # raw PCM 16-bit mono audio for this segment
    confidence: float  # mean speech probability [0, 1]


@dataclass
class ASRSegment:
    """A transcribed speech segment."""

    start: float  # seconds from stream start
    end: float  # seconds from stream start
    text: str  # transcribed Chinese / English text
    confidence: float  # model confidence [0, 1]
    speaker: str = ""  # speaker identifier (set by StreamingTranscriber)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bytes_to_wav(audio_bytes: bytes, sample_rate: int) -> bytes:
    """Wrap raw PCM 16-bit mono bytes in a WAV container (in-memory)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(audio_bytes)
    return buf.getvalue()


def _collapse_cjk_spaces(text: str) -> str:
    """Remove spaces between CJK characters (paraformer-zh outputs '你 好' style).

    Uses lookahead/lookbehind to handle overlapping matches (e.g., "你 好 我" → "你好我").
    Preserves spaces that separate Latin words from CJK text.
    """
    import re

    # CJK character ranges (Unicode):
    # U+4E00-U+9FFF  CJK Unified Ideographs (common)
    # U+3400-U+4DBF  CJK Unified Ideographs Extension A
    cjk_char = r'[一-鿿㐀-䶿]'

    # Remove whitespace between two CJK characters (uses lookahead/lookbehind
    # so overlapping matches like "你 好 我" are handled correctly)
    text = re.sub(r'(?<=' + cjk_char + r')\s+(?=' + cjk_char + r')', '', text)

    return text


# ── FunASR VAD wrapper (fsmn-vad, lazy singleton) ──

_funasr_vad = None

def _get_funasr_vad():
    global _funasr_vad
    if _funasr_vad is None:
        from funasr import AutoModel
        _funasr_vad = AutoModel(model="fsmn-vad", disable_update=True)
    return _funasr_vad


class VADProcessor:
    """Voice activity detection using FunASR fsmn-vad.

    Buffers PCM audio chunks and emits VADSegment instances when complete
    speech segments are detected.  Accumulates ~1 second of audio before
    running the VAD model (configurable via ``min_accumulate_s``).
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        min_speech_duration_ms: int = 500,
        min_accumulate_s: float = 1.0,
    ):
        self._sample_rate = sample_rate
        self._min_speech_duration_ms = min_speech_duration_ms
        self._min_accumulate_s = min_accumulate_s
        self._buffer = bytearray()
        self._offset_samples = 0
        self._current_sample = 0

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    def feed(self, audio_bytes: bytes) -> list[VADSegment]:
        """Feed a chunk of raw PCM audio, return completed VAD segments."""
        self._buffer.extend(audio_bytes)

        # Accumulate at least min_accumulate_s before running VAD
        min_bytes = int(self._sample_rate * self._min_accumulate_s * 2)  # 16-bit = 2 bytes/sample
        if len(self._buffer) < min_bytes:
            return []

        return self._run_vad()

    def flush(self) -> list[VADSegment]:
        """Process any remaining audio in the buffer, regardless of duration.

        Call this when the audio stream ends (e.g., WebSocket disconnect)
        to avoid losing the final partial buffer of speech.
        """
        if len(self._buffer) == 0:
            return []
        return self._run_vad()

    def _run_vad(self) -> list[VADSegment]:
        """Run fsmn-vad on the current buffer and return detected segments."""
        import tempfile
        import os

        # Write buffer to temp WAV for fsmn-vad
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        try:
            with os.fdopen(tmp_fd, "wb") as tmp:
                with wave.open(tmp, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(self._sample_rate)
                    wf.writeframes(bytes(self._buffer))

            model = _get_funasr_vad()
            result = model.generate(input=tmp_path)
        finally:
            os.unlink(tmp_path)

        # Clear buffer after processing
        buf_copy = bytes(self._buffer)
        buf_len_samples = len(buf_copy) // 2
        self._buffer = bytearray()

        segments: list[VADSegment] = []
        if result and isinstance(result, list) and len(result) > 0:
            r = result[0]
            vad_list = r.get("value", []) or []
            for seg in vad_list:
                if isinstance(seg, list):
                    start_ms, end_ms = seg[0], seg[1]
                elif isinstance(seg, dict):
                    start_ms = seg.get("start", 0)
                    end_ms = seg.get("end", 0)
                else:
                    continue

                start_sec = start_ms / 1000.0
                end_sec = end_ms / 1000.0

                # Extract audio bytes for this segment
                samp_start = max(0, int(start_sec * self._sample_rate))
                samp_end = min(buf_len_samples, int(end_sec * self._sample_rate))
                seg_audio = buf_copy[samp_start * 2 : samp_end * 2]

                if len(seg_audio) < self._min_speech_duration_ms * self._sample_rate // 500:
                    continue

                segments.append(VADSegment(
                    start=start_sec + self._offset_samples / self._sample_rate,
                    end=end_sec + self._offset_samples / self._sample_rate,
                    audio_bytes=seg_audio,
                    confidence=0.9,  # fsmn-vad doesn't return per-segment confidence; default high
                ))

        self._offset_samples += buf_len_samples
        self._current_sample = self._offset_samples
        return segments

    def reset(self) -> None:
        self._buffer = bytearray()
        self._offset_samples = 0
        self._current_sample = 0


# ── FunASR ASR wrapper (paraformer-zh, lazy singleton) ──

_funasr_asr = None

def _get_funasr_asr():
    global _funasr_asr
    if _funasr_asr is None:
        from funasr import AutoModel
        _funasr_asr = AutoModel(model="paraformer-zh", disable_update=True)
    return _funasr_asr


class ASRProcessor:
    """Transcribes audio segments using FunASR paraformer-zh (220M).

    RTF ~0.047 vs faster-whisper's 0.58 on CPU.
    Outputs simplified Chinese — no OpenCC conversion needed.
    """

    def __init__(self, sample_rate: int = 16000):
        self._sample_rate = sample_rate

    def transcribe(self, audio_bytes: bytes) -> str:
        """Transcribe a single speech segment. Returns text string."""
        import tempfile
        import wave
        import os

        if not audio_bytes or len(audio_bytes) < self._sample_rate // 10:
            return ""

        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        try:
            with os.fdopen(tmp_fd, "wb") as tmp:
                with wave.open(tmp, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(self._sample_rate)
                    wf.writeframes(audio_bytes)

            model = _get_funasr_asr()
            result = model.generate(input=tmp_path)
        finally:
            os.unlink(tmp_path)

        if result and isinstance(result, list) and len(result) > 0:
            r = result[0]
            text = r.get("text", "")
            if isinstance(text, list):
                text = " ".join(text)
            text = text.strip()
            # paraformer-zh outputs CJK characters separated by spaces ("你 好") — collapse them
            text = _collapse_cjk_spaces(text)
            return text
        return ""

# ---------------------------------------------------------------------------
# Pyannote secondary VAD (false-positive filter)
# ---------------------------------------------------------------------------


def _load_pyannote_vad():
    """Load pyannote Voice Activity Detection pipeline if HF token is configured.

    Returns the pipeline or ``None`` if unavailable.
    """
    if not settings.huggingface_token:
        logger.debug("pyannote VAD skipped: HUGGINGFACE_TOKEN not set")
        return None

    try:
        from pyannote.audio import Pipeline

        pipeline = Pipeline.from_pretrained(
            "pyannote/voice-activity-detection",
            token=settings.huggingface_token,
        )
        return pipeline
    except Exception:
        logger.warning("Failed to load pyannote VAD pipeline", exc_info=True)
        return None


def _pyannote_check(audio_bytes: bytes, sample_rate: int, pipeline) -> float:
    """Run pyannote VAD on a segment and return the speech ratio [0, 1].

    Returns 1.0 if the pipeline confirms speech, 0.0 otherwise.
    Used as a secondary filter to reject false positives from Silero-VAD.
    """
    if pipeline is None:
        return 1.0  # pass-through when pyannote unavailable

    try:
        import torchaudio

        wav_bytes = _bytes_to_wav(audio_bytes, sample_rate)
        with io.BytesIO(wav_bytes) as buf:
            waveform, sr = torchaudio.load(buf)

        vad = pipeline({"waveform": waveform, "sample_rate": sr})
        total_speech = 0.0
        total_duration = waveform.shape[1] / sr if sr > 0 else 0.0

        for segment in vad.itersegments():
            total_speech += segment.end - segment.start

        if total_duration > 0:
            return min(total_speech / total_duration, 1.0)
        return 0.0
    except Exception:
        logger.debug("pyannote secondary check failed", exc_info=True)
        return 1.0  # pass-through on error


# ---------------------------------------------------------------------------
# StreamingTranscriber
# ---------------------------------------------------------------------------


class StreamingTranscriber:
    """Orchestrator that combines VAD + ASR for real-time speech transcription.

    Audio flow::

        PCM bytes
          │
          ▼
      VADProcessor  ──►  VADSegment list
          │                    │
          │           pyannote secondary check (optional)
          │                    │
          ▼                    ▼
      ASRProcessor   ──►  ASRSegment list

    Parameters
    ----------
    sample_rate : int
        Input audio sample rate (default 8000).
    vad_threshold : float
        Reserved — FunASR fsmn-vad does its own thresholding.
    min_speech_duration_ms : int
        Minimum speech segment duration.
    max_speech_duration_s : float
        Maximum speech segment duration before force-split (reserved).
    enable_pyannote_check : bool
        If True, use pyannote VAD as a secondary false-positive filter.
    enable_speaker_clustering : bool
        If True, use OnlineSpeakerClustering to assign speaker IDs to each
        transcribed segment in real time.
    """

    def __init__(
        self,
        sample_rate: int = 8000,
        vad_threshold: float = 0.5,
        min_speech_duration_ms: int = 500,
        max_speech_duration_s: float = 10.0,
        enable_pyannote_check: bool = False,
        enable_speaker_clustering: bool = False,
    ):
        self.sample_rate = sample_rate

        self._vad = VADProcessor(sample_rate=sample_rate, min_speech_duration_ms=min_speech_duration_ms)
        self._asr = ASRProcessor(sample_rate=sample_rate)
        self._pyannote = _load_pyannote_vad() if enable_pyannote_check else None
        self._enable_pyannote = enable_pyannote_check

        # Speaker clustering (lazy init)
        self._enable_speaker_clustering = enable_speaker_clustering
        self._speaker_clustering = None
        if enable_speaker_clustering:
            from .speaker_clustering import OnlineSpeakerClustering
            self._speaker_clustering = OnlineSpeakerClustering(
                similarity_threshold=0.35,
                min_segment_duration_ms=1500,
            )

        # Track cumulative time offset for segments
        self._processed_seconds = 0.0

    # -- public API ---------------------------------------------------------

    def feed_chunk(self, audio_bytes: bytes) -> list[ASRSegment]:
        """Feed a chunk of raw PCM 16-bit mono audio and return any
        newly-transcribed speech segments.

        Each returned ASR segment has absolute timestamps (seconds from the
        first call to ``feed_chunk`` or since the last ``reset``).
        """
        # Step 1: VAD
        vad_segments = self._vad.feed(audio_bytes)
        return self._transcribe_segments(vad_segments)

    def flush(self) -> list[ASRSegment]:
        """Process any remaining audio in the VAD buffer.

        Must be called before ``reset()`` on stream end (e.g., WebSocket
        disconnect) to avoid losing the final partial buffer of speech.
        """
        vad_segments = self._vad.flush()
        return self._transcribe_segments(vad_segments)

    def _transcribe_segments(self, vad_segments: list[VADSegment]) -> list[ASRSegment]:
        """Shared processing pipeline: VAD segments → ASR transcription."""
        results: list[ASRSegment] = []

        for vseg in vad_segments:
            # Step 1: Pyannote secondary check (best-effort)
            if self._enable_pyannote and self._pyannote is not None:
                speech_ratio = _pyannote_check(
                    vseg.audio_bytes, self.sample_rate, self._pyannote
                )
                if speech_ratio < 0.1:
                    logger.debug(
                        "Pyannote rejected VAD segment %.2f-%.2f (speech_ratio=%.2f)",
                        vseg.start, vseg.end, speech_ratio,
                    )
                    continue

            # Step 2: Speaker clustering (before ASR, based on audio only)
            speaker_id = ""
            if self._speaker_clustering is not None:
                speaker_id = self._speaker_clustering.add_segment(
                    vseg.audio_bytes, self.sample_rate
                )

            # Step 3: ASR transcription (paraformer→string)
            text = self._asr.transcribe(vseg.audio_bytes)

            if text.strip():
                results.append(ASRSegment(
                    start=self._processed_seconds + vseg.start,
                    end=self._processed_seconds + vseg.end,
                    text=text,
                    confidence=vseg.confidence,
                    speaker=speaker_id,
                ))

        return results

    def reset(self) -> None:
        """Reset the entire pipeline (VAD state, ASR model persists)."""
        self._vad.reset()
        self._processed_seconds = 0.0

    @property
    def total_seconds(self) -> float:
        """Total audio processed (seconds)."""
        return self._vad._current_sample / self._vad._sample_rate if self._vad._sample_rate > 0 else 0.0

    def get_speaker_names(self) -> dict[str, str]:
        """Return the current speaker ID -> role name mapping.

        Returns an empty dict if speaker clustering is disabled.
        """
        if self._speaker_clustering is not None:
            return self._speaker_clustering.assign_speaker_roles()
        return {}
