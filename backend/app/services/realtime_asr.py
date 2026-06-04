"""
Real-time ASR pipeline: FunASR fsmn-vad + paraformer-zh streaming transcription.

Architecture
------------
Audio chunks flow through three stages:
1. VADProcessor   — buffers PCM audio, runs FunASR fsmn-vad,
                     emits complete speech segments with timestamps
2. ASRProcessor    — transcribes audio segments via FunASR paraformer-zh (220M)
3. StreamingTranscriber — orchestrates 1+2, optional speaker clustering

Key optimizations for real-time:
- VAD retains tail audio after last detected segment (no data loss across buffer boundaries)
- In-memory WAV via BytesIO (no temp file I/O)
- Reduced buffer accumulation (0.5s vs 1.0s)
- Consecutive VAD segments batched into single ASR call for better accuracy
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


def _bytes_to_wav_bytes(audio_bytes: bytes, sample_rate: int) -> bytes:
    """Wrap raw PCM 16-bit mono bytes in a WAV container (in-memory, no disk I/O)."""
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

    cjk_char = r'[一-鿿㐀-䶿]'
    text = re.sub(r'(?<=' + cjk_char + r')\s+(?=' + cjk_char + r')', '', text)
    return text


# ── FunASR model singletons (lazy-loaded, reused across connections) ──

_funasr_vad = None
_funasr_streaming_asr = None
_funasr_nano = None


def _get_funasr_vad():
    global _funasr_vad
    if _funasr_vad is None:
        from funasr import AutoModel
        _funasr_vad = AutoModel(model="fsmn-vad", disable_update=True, device="cuda")
    return _funasr_vad


def _get_funasr_streaming_asr():
    global _funasr_streaming_asr
    if _funasr_streaming_asr is None:
        from funasr import AutoModel
        _funasr_streaming_asr = AutoModel(
            model=settings.funasr_streaming_model,
            disable_update=True,
            device=settings.funasr_streaming_device,
        )
    return _funasr_streaming_asr


def _get_funasr_nano():
    global _funasr_nano
    if _funasr_nano is None:
        try:
            from funasr import AutoModel
            _funasr_nano = AutoModel(
                model=settings.funasr_calibration_model,
                disable_update=True,
                device=settings.funasr_calibration_device,
            )
            logger.info("FunASR-Nano loaded: model=%s device=%s",
                        settings.funasr_calibration_model, settings.funasr_calibration_device)
        except Exception:
            logger.warning("Failed to load FunASR-Nano, calibration disabled", exc_info=True)
            _funasr_nano = False  # sentinel: tried but failed
    return _funasr_nano if _funasr_nano is not False else None


# ---------------------------------------------------------------------------
# VADProcessor — fsmn-vad with tail retention
# ---------------------------------------------------------------------------


class VADProcessor:
    """Voice activity detection using FunASR fsmn-vad.

    Buffers PCM audio chunks and emits VADSegment instances when complete
    speech segments are detected.  **Retains trailing audio** after the last
    detected segment — unlike the old implementation which discarded it.

    Parameters
    ----------
    sample_rate : int
        Input audio sample rate (16000).
    min_speech_duration_ms : int
        Minimum speech segment duration in milliseconds.
    min_accumulate_s : float
        Minimum audio to accumulate before running VAD (seconds).
        Lower = less latency but more frequent VAD calls.
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        min_speech_duration_ms: int = 400,
        min_accumulate_s: float = 0.5,
    ):
        self._sample_rate = sample_rate
        self._min_speech_duration_ms = min_speech_duration_ms
        self._min_accumulate_s = min_accumulate_s
        self._buffer = bytearray()
        self._offset_seconds = 0.0   # cumulative time offset for absolute timestamps

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    def feed(self, audio_bytes: bytes) -> list[VADSegment]:
        """Feed a chunk of raw PCM audio, return completed VAD segments."""
        self._buffer.extend(audio_bytes)

        min_bytes = int(self._sample_rate * self._min_accumulate_s * 2)
        if len(self._buffer) < min_bytes:
            return []

        return self._run_vad()

    def flush(self) -> list[VADSegment]:
        """Process all remaining audio in the buffer.

        Call on stream end to avoid losing the final speech segment.
        """
        if len(self._buffer) == 0:
            return []
        return self._run_vad(force_all=True)

    def _run_vad(self, force_all: bool = False) -> list[VADSegment]:
        """Run fsmn-vad on buffered audio.

        After VAD runs:
        - Detected speech segments are extracted and returned
        - Audio BEFORE the first speech segment is discarded (silence)
        - Audio AFTER the last speech segment is **retained** in the buffer
          (may be the start of the next utterance)
        """
        import tempfile
        import os

        buf_copy = bytes(self._buffer)
        buf_len_samples = len(buf_copy) // 2

        # Write to temp WAV for fsmn-vad (FunASR fsmn-vad requires file path)
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        try:
            with os.fdopen(tmp_fd, "wb") as tmp:
                with wave.open(tmp, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(self._sample_rate)
                    wf.writeframes(buf_copy)

            model = _get_funasr_vad()
            result = model.generate(input=tmp_path)
        finally:
            os.unlink(tmp_path)

        # Parse VAD result
        vad_list: list[tuple[int, int]] = []
        if result and isinstance(result, list) and len(result) > 0:
            r = result[0]
            raw_list = r.get("value", []) or []
            for seg in raw_list:
                if isinstance(seg, list):
                    vad_list.append((int(seg[0]), int(seg[1])))
                elif isinstance(seg, dict):
                    vad_list.append((int(seg.get("start", 0)), int(seg.get("end", 0))))

        # ── Determine what to discard vs retain ──
        if vad_list:
            # Retain audio AFTER the last detected speech segment
            last_end_ms = vad_list[-1][1]
            last_end_samples = int(last_end_ms / 1000.0 * self._sample_rate)
            # Add a small margin (200ms) to avoid cutting off speech tails
            margin_samples = int(0.2 * self._sample_rate)
            keep_start = min(last_end_samples + margin_samples, buf_len_samples)

            # Keep tail audio for next round
            tail_bytes = buf_copy[keep_start * 2:]
            self._buffer = bytearray(tail_bytes)
        else:
            if force_all:
                # flush(): no speech detected, treat entire buffer as one segment
                vad_list = [(0, int(buf_len_samples / self._sample_rate * 1000))]
                self._buffer = bytearray()
            else:
                # No speech yet — keep buffering (up to ~5s max)
                max_samples = 5 * self._sample_rate
                if buf_len_samples > max_samples:
                    # Trim oldest silence to avoid unbounded growth
                    trim_samples = buf_len_samples - max_samples
                    self._buffer = bytearray(buf_copy[trim_samples * 2:])
                    self._offset_seconds += trim_samples / self._sample_rate
                return []

        # ── Extract VAD segments ──
        segments: list[VADSegment] = []
        for start_ms, end_ms in vad_list:
            dur_ms = end_ms - start_ms
            if dur_ms < self._min_speech_duration_ms:
                continue

            start_sec = start_ms / 1000.0
            end_sec = end_ms / 1000.0

            samp_start = max(0, int(start_sec * self._sample_rate))
            samp_end = min(buf_len_samples, int(end_sec * self._sample_rate))
            seg_audio = buf_copy[samp_start * 2 : samp_end * 2]

            if len(seg_audio) < self._min_speech_duration_ms * self._sample_rate // 250:
                continue

            segments.append(VADSegment(
                start=self._offset_seconds + start_sec,
                end=self._offset_seconds + end_sec,
                audio_bytes=seg_audio,
                confidence=0.9,
            ))

        # Advance offset past the discarded audio
        if vad_list:
            first_start_ms = vad_list[0][0]
            first_start_samples = int(first_start_ms / 1000.0 * self._sample_rate)
            # Also advance past any silence before the first segment
            discard_samples = max(0, first_start_samples - int(0.1 * self._sample_rate))
            self._offset_seconds += discard_samples / self._sample_rate

        return segments

    def reset(self) -> None:
        """Reset VAD state for a new stream."""
        self._buffer = bytearray()
        self._offset_seconds = 0.0


# ---------------------------------------------------------------------------
# ASRProcessor — streaming paraformer-zh with chunk-level inference
# ---------------------------------------------------------------------------


class StreamingASRProcessor:
    """Transcribes audio in real time using paraformer-zh-streaming (220M CUDA).

    Unlike the old ASRProcessor which waited for a complete VAD segment,
    this class processes audio chunk-by-chunk and emits incremental partial
    text.  Each call to :meth:`transcribe_chunk` advances the internal cache.

    Cache lifecycle
    ---------------
    - ``reset_cache()`` must be called at the start of each new VAD segment.
    - ``is_final=True`` on the last chunk of a segment flushes the cache.
    - The cache dict is the FunASR streaming state; never mutate it directly.
    """

    CHUNK_SIZE = [0, 10, 5]          # frames: lookback 0 / current 10 / lookahead 5
    ENCODER_LOOKBACK = 4              # encoder chunk look-back
    DECODER_LOOKBACK = 1              # decoder chunk look-back

    def __init__(self, sample_rate: int = 16000):
        self._sample_rate = sample_rate
        self._cache: dict = {}

    def transcribe_chunk(
        self, audio_bytes: bytes, is_final: bool
    ) -> tuple[str, float]:
        """Streaming inference on one audio chunk.

        Parameters
        ----------
        audio_bytes : bytes
            Raw PCM 16-bit mono audio for this chunk.
        is_final : bool
            True for the last chunk of a VAD segment (flushes internal state).

        Returns
        -------
        (text, confidence)
            text — cumulative text so far for this segment.
            confidence — model confidence [0, 1].
        """
        if not audio_bytes or len(audio_bytes) < self._sample_rate // 50:  # < 20ms
            return ("", 0.0)

        import numpy as np
        samples = (
            np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        )

        model = _get_funasr_streaming_asr()
        result = model.generate(
            input=samples,
            cache=self._cache,
            is_final=is_final,
            chunk_size=self.CHUNK_SIZE,
            encoder_chunk_look_back=self.ENCODER_LOOKBACK,
            decoder_chunk_look_back=self.DECODER_LOOKBACK,
        )

        text = ""
        confidence = 0.0
        if result and isinstance(result, list) and len(result) > 0:
            r = result[0]
            raw_text = r.get("text", "")
            if isinstance(raw_text, list):
                raw_text = " ".join(raw_text)
            text = raw_text.strip()
            text = _collapse_cjk_spaces(text)
            # confidence: use model's token-level mean if available
            confidence = float(r.get("confidence", 0.9))

        return (text, confidence)

    def transcribe_full(self, audio_bytes: bytes) -> tuple[str, float]:
        """Non-streaming inference on a complete audio segment.

        Used as fallback when streaming is not needed (e.g., post_sales).
        Resets cache internally — safe to call mid-stream.
        """
        self.reset_cache()
        return self.transcribe_chunk(audio_bytes, is_final=True)

    def reset_cache(self) -> None:
        """Reset streaming cache for a new VAD segment."""
        self._cache = {}


# ---------------------------------------------------------------------------
# Pyannote secondary VAD (false-positive filter) — kept for optional use
# ---------------------------------------------------------------------------


def _load_pyannote_vad():
    """Load pyannote Voice Activity Detection pipeline if HF token is configured."""
    if not settings.huggingface_token:
        return None

    try:
        from pyannote.audio import Pipeline
        return Pipeline.from_pretrained(
            "pyannote/voice-activity-detection",
            token=settings.huggingface_token,
        )
    except Exception:
        logger.warning("Failed to load pyannote VAD pipeline", exc_info=True)
        return None


def _pyannote_check(audio_bytes: bytes, sample_rate: int, pipeline) -> float:
    """Run pyannote VAD on a segment and return the speech ratio [0, 1]."""
    if pipeline is None:
        return 1.0

    try:
        import torchaudio

        wav_bytes = _bytes_to_wav_bytes(audio_bytes, sample_rate)
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
        return 1.0


# ---------------------------------------------------------------------------
# StreamingTranscriber — orchestrator
# ---------------------------------------------------------------------------


class StreamingTranscriber:
    """Orchestrator that combines VAD + ASR for real-time speech transcription.

    Audio flow::

        PCM bytes
          │
          ▼
      VADProcessor  ──►  VADSegment list
          │                    │
          │           speaker clustering (optional)
          │                    │
          ▼                    ▼
      ASRProcessor   ──►  ASRSegment list
                     (batched for better accuracy)
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        vad_threshold: float = 0.5,
        min_speech_duration_ms: int = 400,
        max_speech_duration_s: float = 8.0,
        enable_pyannote_check: bool = False,
        enable_speaker_clustering: bool = False,
    ):
        self.sample_rate = sample_rate

        self._vad = VADProcessor(
            sample_rate=sample_rate,
            min_speech_duration_ms=min_speech_duration_ms,
            min_accumulate_s=0.5,   # 500ms latency vs old 1000ms
        )
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

    # -- public API ---------------------------------------------------------

    def feed_chunk(self, audio_bytes: bytes) -> list[ASRSegment]:
        """Feed a chunk of raw PCM 16-bit mono audio and return any
        newly-transcribed speech segments.

        Each returned ASR segment has absolute timestamps (seconds from the
        first call to ``feed_chunk`` or since the last ``reset``).
        """
        vad_segments = self._vad.feed(audio_bytes)
        return self._transcribe_segments(vad_segments)

    def flush(self) -> list[ASRSegment]:
        """Process any remaining audio in the VAD buffer.

        Must be called before ``reset()`` on stream end.
        """
        vad_segments = self._vad.flush()
        return self._transcribe_segments(vad_segments)

    def _transcribe_segments(self, vad_segments: list[VADSegment]) -> list[ASRSegment]:
        """Transcribe VAD segments, batching consecutive ones for better accuracy.

        Non-consecutive segments (gap > 2s) are transcribed separately.
        """
        if not vad_segments:
            return []

        # Group consecutive segments (gap < 2s between them)
        groups: list[list[VADSegment]] = []
        current_group: list[VADSegment] = []

        for seg in vad_segments:
            if not current_group:
                current_group.append(seg)
            elif seg.start - current_group[-1].end < 2.0:
                current_group.append(seg)
            else:
                groups.append(current_group)
                current_group = [seg]
        if current_group:
            groups.append(current_group)

        # Transcribe each group
        results: list[ASRSegment] = []
        for group in groups:
            # Batched transcription for multi-segment groups
            if len(group) > 1:
                texts = self._asr.transcribe_batch(group)
            else:
                texts = [self._asr.transcribe(group[0].audio_bytes)]

            for i, (vseg, text) in enumerate(zip(group, texts)):
                if not text.strip():
                    continue

                # Speaker clustering
                speaker_id = ""
                if self._speaker_clustering is not None:
                    speaker_id = self._speaker_clustering.add_segment(
                        vseg.audio_bytes, self.sample_rate
                    )

                results.append(ASRSegment(
                    start=vseg.start,
                    end=vseg.end,
                    text=text,
                    confidence=vseg.confidence,
                    speaker=speaker_id,
                ))

        return results

    def reset(self) -> None:
        """Reset the entire pipeline (VAD state, ASR model persists)."""
        self._vad.reset()

    @property
    def total_seconds(self) -> float:
        """Total audio processed (seconds)."""
        return self._vad._offset_seconds

    def get_speaker_names(self) -> dict[str, str]:
        """Return the current speaker ID -> role name mapping."""
        if self._speaker_clustering is not None:
            return self._speaker_clustering.assign_speaker_roles()
        return {}
