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
from concurrent.futures import ThreadPoolExecutor
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
    segment_id: str = ""  # unique ID for partial→final tracking
    is_partial: bool = True  # True = streaming partial, False = final/calibrated
    calibrated: bool = False  # True = Nano calibration applied


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
# NanoCalibrator — post-segment calibration via FunASR-Nano (800M CPU)
# ---------------------------------------------------------------------------


class NanoCalibrator:
    """High-accuracy post-segment calibration using FunASR-Nano (800M CPU).

    After a VAD segment ends and the streaming ASR produces its final text,
    NanoCalibrator re-transcribes the complete segment audio for improved
    accuracy — especially on dialects, accents, and noisy audio.

    Runs on CPU to avoid competing with the streaming ASR on GPU.
    """

    def __init__(self, sample_rate: int = 16000):
        self._sample_rate = sample_rate
        self._model = None
        self._available: bool | None = None  # None = not tried yet

    @property
    def available(self) -> bool:
        """True if the Nano model loaded successfully."""
        if self._available is None:
            self._ensure_model()
        return self._available

    def _ensure_model(self) -> bool:
        if self._available is not None:
            return self._available
        self._model = _get_funasr_nano()
        self._available = self._model is not None
        return self._available

    def calibrate(self, audio_bytes: bytes, hotword: str = "") -> tuple[str, float]:
        """Transcribe a complete VAD segment with FunASR-Nano.

        Parameters
        ----------
        audio_bytes : bytes
            Full segment PCM 16-bit mono audio.
        hotword : str
            Optional hotword for domain-specific terms (reserved, not yet used).

        Returns
        -------
        (text, confidence)
            If Nano is unavailable, returns ("", 0.0) — caller should fall back
            to the streaming ASR final result.
        """
        if not self.available:
            return ("", 0.0)

        if not audio_bytes or len(audio_bytes) < self._sample_rate // 10:
            return ("", 0.0)

        import tempfile
        import os

        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        try:
            # Write raw PCM as WAV file (FunASR-Nano needs file path, not bytes)
            with os.fdopen(tmp_fd, "wb") as tmp:
                with wave.open(tmp, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(self._sample_rate)
                    wf.writeframes(audio_bytes)

            kwargs = {"input": tmp_path}
            if hotword:
                kwargs["hotword"] = hotword

            result = self._model.generate(**kwargs)

            text = ""
            confidence = 0.0
            if result and isinstance(result, list) and len(result) > 0:
                r = result[0]
                raw_text = r.get("text", "")
                if isinstance(raw_text, list):
                    raw_text = " ".join(raw_text)
                text = raw_text.strip()
                text = _collapse_cjk_spaces(text)
                confidence = float(r.get("confidence", 0.95))

            return (text, confidence)
        except Exception:
            logger.warning("NanoCalibrator: calibration failed", exc_info=True)
            return ("", 0.0)
        finally:
            os.unlink(tmp_path)



# ---------------------------------------------------------------------------
# StreamingTranscriber — orchestrator with energy gate + streaming + calibration
# ---------------------------------------------------------------------------


class StreamingTranscriber:
    """Orchestrator: EnergyGate → StreamingASR → VAD boundary → NanoCalibrator.

    Audio flow::

        PCM bytes
          │
          ├─► EnergyGate ──► "speaking?" gate
          │        │
          │        ▼ yes
          │   StreamingASRProcessor ──► partial ASRSegment (is_partial=True)
          │        │
          │        │  (audio also accumulated for calibration)
          │        ▼
          │   VADProcessor ──► detects segment end (via energy gate)
          │        │
          │        ▼ segment end
          │   StreamingASR finalize ──► ASRSegment (is_partial=False, calibrated=False)
          │        │
          │        ▼ async (CPU thread pool)
          │   NanoCalibrator ──► ASRSegment (is_partial=False, calibrated=True)
          │
          └─► SpeakerClustering (unchanged, applied to each segment)
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        min_speech_duration_ms: int = 400,
        max_speech_duration_s: float = 8.0,
        enable_speaker_clustering: bool = False,
    ):
        self.sample_rate = sample_rate
        self._vad = VADProcessor(
            sample_rate=sample_rate,
            min_speech_duration_ms=min_speech_duration_ms,
            min_accumulate_s=0.3,   # faster VAD polling for streaming
        )
        self._streaming_asr = StreamingASRProcessor(sample_rate=sample_rate)
        self._calibrator = NanoCalibrator(sample_rate=sample_rate)
        self._calib_executor = ThreadPoolExecutor(max_workers=1)

        # Energy gate — fast RMS speech detection (~50ms latency)
        self._energy_threshold = 0.008    # RMS threshold for speech
        self._energy_hold_ms = 400        # silence before declaring speech end
        self._energy_silence_samples = 0
        self._energy_hold_samples = int(self._energy_hold_ms / 1000 * sample_rate)
        self._energy_active = False

        # Session state
        self._in_speech = False
        self._segment_counter = 0
        self._current_segment_audio = bytearray()
        self._current_segment_start = 0.0
        self._current_segment_id = ""
        self._last_partial_text = ""
        self._session_offset = 0.0        # cumulative seconds processed
        self._segment_start_offset = 0.0  # session_offset at segment start
        self._pending_calibrations: dict[str, bytes] = {}

        # Calibration results queue (populated by background thread, consumed by feed_chunk)
        self._calibration_results: list[ASRSegment] = []

        # Speaker clustering
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
        newly-transcribed speech segments (partial or final).
        """
        results: list[ASRSegment] = []

        # 0. Collect completed calibration results from background thread
        results.extend(self._calibration_results)
        self._calibration_results = []

        # 1. Energy gate — fast speech detection
        was_active = self._energy_active
        self._energy_active = self._check_energy(audio_bytes)

        speech_started = self._energy_active and not was_active
        speech_ended = not self._energy_active and was_active

        # 2. Feed VAD for segment boundary detection (background validation)
        vad_segments = self._vad.feed(audio_bytes)

        # 3. Streaming ASR — feed while speaking
        if self._energy_active or self._in_speech:
            if speech_started or (self._energy_active and not self._in_speech):
                # New speech segment starting
                self._in_speech = True
                self._current_segment_audio = bytearray()
                self._current_segment_start = self._session_offset
                self._segment_start_offset = self._session_offset
                self._segment_counter += 1
                self._current_segment_id = f"seg_{self._segment_counter:04d}"
                self._streaming_asr.reset_cache()
                self._last_partial_text = ""

            self._current_segment_audio.extend(audio_bytes)

            is_final = speech_ended
            text, conf = self._streaming_asr.transcribe_chunk(
                audio_bytes, is_final=is_final
            )

            if text and text != self._last_partial_text:
                self._last_partial_text = text
                seg = self._build_segment(
                    start=self._current_segment_start,
                    end=self._session_offset + len(audio_bytes) / (self.sample_rate * 2),
                    text=text,
                    confidence=conf,
                    is_partial=not is_final,
                    calibrated=False,
                )
                results.append(seg)

        # 4. When speech ends — submit calibration
        if speech_ended and self._in_speech:
            self._in_speech = False
            full_audio = bytes(self._current_segment_audio)
            seg_id = self._current_segment_id
            self._pending_calibrations[seg_id] = full_audio

            # Submit async calibration (non-blocking)
            self._calib_executor.submit(self._run_calibration, seg_id, full_audio)
            logger.debug("Calibration submitted for %s (%d bytes)", seg_id, len(full_audio))

        # 5. Advance session offset
        chunk_duration = len(audio_bytes) / (self.sample_rate * 2)
        self._session_offset += chunk_duration

        return results

    def flush(self) -> list[ASRSegment]:
        """Process remaining audio and wait for pending calibrations."""
        results: list[ASRSegment] = []

        # Collect any completed calibration results
        results.extend(self._calibration_results)
        self._calibration_results = []

        # Flush VAD buffer
        vad_segments = self._vad.flush()

        # If still in speech, finalize
        if self._in_speech and len(self._current_segment_audio) > 0:
            final_text, final_conf = self._streaming_asr.transcribe_chunk(
                b"", is_final=True
            )
            self._streaming_asr.reset_cache()
            seg_id = self._current_segment_id
            full_audio = bytes(self._current_segment_audio)
            self._pending_calibrations[seg_id] = full_audio
            self._calib_executor.submit(self._run_calibration, seg_id, full_audio)
            self._in_speech = False

            if final_text:
                results.append(self._build_segment(
                    start=self._current_segment_start,
                    end=self._session_offset,
                    text=final_text,
                    confidence=final_conf,
                    is_partial=False,
                    calibrated=False,
                ))

        # Wait for pending calibrations (max 5s)
        import time
        deadline = time.time() + 5.0
        while self._pending_calibrations and time.time() < deadline:
            time.sleep(0.1)
            results.extend(self._calibration_results)
            self._calibration_results = []

        # Any remaining results
        results.extend(self._calibration_results)
        self._calibration_results = []

        return results

    def reset(self) -> None:
        """Reset the entire pipeline for a new session."""
        self._vad.reset()
        self._streaming_asr.reset_cache()
        self._energy_silence_samples = 0
        self._energy_active = False
        self._in_speech = False
        self._segment_counter = 0
        self._current_segment_audio = bytearray()
        self._current_segment_start = 0.0
        self._last_partial_text = ""
        self._session_offset = 0.0
        self._pending_calibrations.clear()
        self._calibration_results.clear()
        if self._speaker_clustering is not None:
            self._speaker_clustering.reset()

    @property
    def total_seconds(self) -> float:
        """Total audio processed (seconds)."""
        return self._session_offset

    def get_speaker_names(self) -> dict[str, str]:
        """Return the current speaker ID -> role name mapping."""
        if self._speaker_clustering is not None:
            return self._speaker_clustering.assign_speaker_roles()
        return {}

    # -- internals -----------------------------------------------------------

    def _check_energy(self, audio_bytes: bytes) -> bool:
        """Lightweight RMS energy gate for fast speech detection."""
        import numpy as np
        samples = (
            np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        )
        rms = float(np.sqrt(np.mean(samples ** 2)))

        if rms > self._energy_threshold:
            self._energy_silence_samples = 0
            return True
        else:
            self._energy_silence_samples += len(samples)
            if self._energy_silence_samples >= self._energy_hold_samples:
                return False
            return self._energy_active  # hold previous state during short gaps

    def _build_segment(
        self, start: float, end: float, text: str, confidence: float,
        is_partial: bool, calibrated: bool,
    ) -> ASRSegment:
        """Construct an ASRSegment with speaker clustering applied."""
        speaker_id = ""
        if self._speaker_clustering is not None:
            # For partial segments, use last known speaker
            if is_partial and self._speaker_clustering._last_speaker_id:
                speaker_id = self._speaker_clustering._last_speaker_id
            elif not is_partial:
                # For final segments, run clustering on the full audio
                full_audio = bytes(self._current_segment_audio)
                speaker_id = self._speaker_clustering.add_segment(
                    full_audio, self.sample_rate
                )

        return ASRSegment(
            start=start,
            end=end,
            text=text,
            confidence=confidence,
            speaker=speaker_id,
            segment_id=self._current_segment_id,
            is_partial=is_partial,
            calibrated=calibrated,
        )

    def _run_calibration(self, seg_id: str, audio_bytes: bytes) -> None:
        """Run Nano calibration in background thread.  Thread-safe."""
        try:
            calib_text, calib_conf = self._calibrator.calibrate(audio_bytes)
        except Exception:
            logger.exception("Calibration failed for %s", seg_id)
            calib_text, calib_conf = "", 0.0

        if not calib_text.strip():
            # Nano unavailable or failed — fallback to streaming final (no-op)
            logger.debug("Calibration skipped for %s (Nano unavailable/no result)", seg_id)
            self._pending_calibrations.pop(seg_id, None)
            return

        seg = ASRSegment(
            start=self._segment_start_offset,
            end=self._segment_start_offset + len(audio_bytes) / (self.sample_rate * 2),
            text=calib_text,
            confidence=calib_conf,
            speaker="",  # will be filled by caller if needed
            segment_id=seg_id,
            is_partial=False,
            calibrated=True,
        )

        # Thread-safe: append to results queue
        self._calibration_results.append(seg)
        self._pending_calibrations.pop(seg_id, None)
        logger.info("Calibration complete for %s: %s", seg_id, calib_text[:80])
