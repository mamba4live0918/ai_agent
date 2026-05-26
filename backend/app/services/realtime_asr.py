"""
Real-time ASR pipeline: Silero-VAD + faster-whisper streaming transcription.

Architecture
------------
Audio chunks flow through three stages:
1. VADProcessor   — buffers PCM audio, runs Silero-VAD in streaming mode,
                     emits complete speech segments with timestamps
2. ASRProcessor    — transcribes audio segments via faster-whisper large-v3-turbo
3. StreamingTranscriber — orchestrates 1+2, optional pyannote secondary VAD check

All classes accept raw PCM 16-bit mono audio bytes and follow the project
conventions established in post_sales_service.py.
"""

from __future__ import annotations

import io
import logging
import tempfile
import wave
from dataclasses import dataclass
from typing import Optional

import numpy as np
import torch

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


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Silero-VAD native window sizes (samples per chunk)
WINDOW_SIZE_8K = 256  # 32 ms @ 8 kHz
WINDOW_SIZE_16K = 512  # 32 ms @ 16 kHz

# Byte-depth of PCM 16-bit mono
BYTES_PER_SAMPLE = 2


def _pcm_to_float32(pcm_bytes: bytes) -> np.ndarray:
    """Convert PCM 16-bit mono bytes to float32 numpy array in [-1, 1]."""
    samples = np.frombuffer(pcm_bytes, dtype=np.int16)
    return samples.astype(np.float32) / 32768.0


def _float32_to_pcm(samples: np.ndarray) -> bytes:
    """Convert float32 numpy array in [-1, 1] to PCM 16-bit mono bytes."""
    clipped = np.clip(samples, -1.0, 1.0)
    int16_samples = (clipped * 32767.0).astype(np.int16)
    return int16_samples.tobytes()


def _bytes_to_wav(audio_bytes: bytes, sample_rate: int) -> bytes:
    """Wrap raw PCM 16-bit mono bytes in a WAV container (in-memory)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(audio_bytes)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# VADProcessor
# ---------------------------------------------------------------------------


class VADProcessor:
    """Streaming Silero-VAD processor that emits complete speech segments.

    Parameters
    ----------
    sample_rate : int
        Input audio sample rate. Silero-VAD supports 8000 and 16000.
        Audio is resampled to 8 kHz internally for VAD if a different rate
        is passed, but the returned *audio_bytes* stay at *sample_rate*.
    window_size_ms : int
        Target window in ms.  Informational only — Silero-VAD natively
        operates on a fixed 32 ms window (256 samples @ 8 kHz, 512 samples
        @ 16 kHz) via its VADIterator, so this parameter does not change
        the actual processing window size.
    threshold : float
        Speech probability threshold [0, 1]. Values above are SPEECH.
    min_speech_duration_ms : int
        Minimum speech duration in ms. Shorter candidates are discarded.
    max_speech_duration_s : float
        Maximum speech duration in seconds. Longer segments are force-split.
    min_silence_duration_ms : int
        Silence duration in ms before a speech segment is considered finished.
    speech_pad_ms : int
        Padding (ms) added to each side of detected segments.
    """

    def __init__(
        self,
        sample_rate: int = 8000,
        window_size_ms: int = 30,
        threshold: float = 0.5,
        min_speech_duration_ms: int = 500,
        max_speech_duration_s: float = 10.0,
        min_silence_duration_ms: int = 100,
        speech_pad_ms: int = 30,
    ):
        if sample_rate not in (8000, 16000):
            logger.warning(
                "VADProcessor: sample_rate=%d not natively supported; "
                "resampling to 8000. Supported: 8000, 16000",
                sample_rate,
            )
            self._input_rate = sample_rate
            self._vad_rate = 8000
            self._need_resample = True
        else:
            self._input_rate = sample_rate
            self._vad_rate = sample_rate
            self._need_resample = False

        self.threshold = threshold
        self.min_speech_duration_ms = min_speech_duration_ms
        self.max_speech_duration_s = max_speech_duration_s
        self.window_size_ms = window_size_ms  # informational only

        # Load Silero-VAD model (singleton per process)
        from silero_vad import VADIterator, load_silero_vad

        self._model = load_silero_vad()
        self._vad_iterator = VADIterator(
            self._model,
            threshold=threshold,
            sampling_rate=self._vad_rate,
            min_silence_duration_ms=min_silence_duration_ms,
            speech_pad_ms=speech_pad_ms,
        )

        # State
        self._audio_buffer: list[float] = []  # raw input samples (float32, input rate)
        self._vad_buffer: list[float] = []  # samples fed to VAD (float32, vad rate)
        self._current_sample = 0  # absolute sample count (vad rate)
        self._segment_start: Optional[int] = None  # vad-rate sample index
        self._speech_probs: list[float] = []  # probabilities during current segment
        self._total_samples_in = 0  # total input samples received
        self._last_window: Optional[np.ndarray] = None  # most recent VAD window

        # Window-size samples for VAD at vad rate
        self._window_samples = WINDOW_SIZE_8K if self._vad_rate == 8000 else WINDOW_SIZE_16K

        # Prevent unbounded memory growth (30 s max buffer)
        self._max_buffer_samples = self._input_rate * 30

    # -- public API ---------------------------------------------------------

    def process_chunk(self, audio_bytes: bytes) -> list[VADSegment]:
        """Feed a chunk of raw PCM 16-bit mono audio and return any
        newly-completed speech segments."""
        if not audio_bytes:
            return []

        # Convert to float32
        chunk = _pcm_to_float32(audio_bytes)
        chunk_list = chunk.tolist()
        self._audio_buffer.extend(chunk_list)
        self._total_samples_in += len(chunk)

        # Resample to VAD rate if needed
        if self._need_resample:
            vad_chunk = self._resample_chunk(chunk)
        else:
            vad_chunk = chunk

        vad_list = vad_chunk.tolist()
        self._vad_buffer.extend(vad_list)

        completed: list[VADSegment] = []

        # Enforce max buffer size to prevent memory growth in long sessions
        while len(self._audio_buffer) > self._max_buffer_samples:
            overflow = len(self._audio_buffer) - self._max_buffer_samples
            self._audio_buffer = self._audio_buffer[overflow:]
            self._total_samples_in -= overflow
            if self._segment_start is not None:
                self._segment_start -= overflow
            logger.debug("VAD buffer trimmed by %d samples (max %d s)",
                         overflow, self._max_buffer_samples // self._input_rate)

        # Feed VAD in fixed-size windows
        while len(self._vad_buffer) >= self._window_samples:
            window = self._vad_buffer[: self._window_samples]
            self._vad_buffer = self._vad_buffer[self._window_samples :]
            self._last_window = np.array(window, dtype=np.float32)

            tensor = torch.tensor(np.array(window, dtype=np.float32))
            result = self._vad_iterator(tensor, return_seconds=False)

            if result is not None:
                if "start" in result:
                    self._segment_start = result["start"]
                    self._speech_probs = [self._get_last_prob()]
                    self._current_sample += self._window_samples
                elif "end" in result and self._segment_start is not None:
                    end_sample = result["end"]
                    # Extract segment audio from buffer
                    seg = self._extract_segment(self._segment_start, end_sample)
                    if seg is not None:
                        completed.append(seg)
                    self._segment_start = None
                    self._speech_probs = []
                    self._current_sample += self._window_samples
                    # Trim audio buffer (keep unprocessed tail)
                    self._trim_audio_buffer(end_sample)
                else:
                    self._current_sample += self._window_samples
            else:
                if self._segment_start is not None:
                    self._speech_probs.append(self._get_last_prob())
                    # Check max speech duration
                    vad_duration = (
                        self._current_sample + self._window_samples - self._segment_start
                    ) / self._vad_rate
                    if vad_duration >= self.max_speech_duration_s:
                        end_sample = self._segment_start + int(
                            self.max_speech_duration_s * self._vad_rate
                        )
                        seg = self._extract_segment(self._segment_start, end_sample)
                        if seg is not None:
                            completed.append(seg)
                        self._segment_start = None
                        self._speech_probs = []
                        self._vad_iterator.reset_states()
                        self._trim_audio_buffer(end_sample)
                self._current_sample += self._window_samples

        return completed

    def reset(self) -> None:
        """Reset VAD state and clear buffers."""
        self._vad_iterator.reset_states()
        self._audio_buffer.clear()
        self._vad_buffer.clear()
        self._current_sample = 0
        self._segment_start = None
        self._speech_probs.clear()
        self._total_samples_in = 0
        self._last_window = None

    @property
    def total_seconds(self) -> float:
        """Total audio received so far, in seconds."""
        return self._total_samples_in / self._input_rate

    # -- internals ----------------------------------------------------------

    def _resample_chunk(self, chunk: np.ndarray) -> np.ndarray:
        """Simple linear resampling from input_rate to vad_rate."""
        if len(chunk) == 0:
            return np.array([], dtype=np.float32)
        try:
            import torchaudio.functional as F

            t = torch.from_numpy(chunk).unsqueeze(0)
            resampled = F.resample(t, self._input_rate, self._vad_rate)
            return resampled.squeeze(0).numpy()
        except Exception:
            # Fallback: crude linear interpolation
            ratio = self._vad_rate / self._input_rate
            out_len = max(1, int(len(chunk) * ratio))
            indices = np.linspace(0, len(chunk) - 1, out_len)
            return np.interp(indices, np.arange(len(chunk)), chunk).astype(np.float32)

    def _get_last_prob(self) -> float:
        """Return the speech probability of the most-recently processed window.

        Re-runs the Silero-VAD model on the saved last window to obtain the
        raw probability, since VADIterator does not expose intermediate probs.
        Falls back to *self.threshold* if the model call fails.
        """
        if self._last_window is None or len(self._last_window) < self._window_samples:
            return self.threshold
        try:
            tensor = torch.from_numpy(self._last_window).unsqueeze(0)
            prob = self._model(tensor, self._vad_rate).item()
            return float(prob)
        except Exception:
            return self.threshold

    def _extract_segment(self, start_vad: int, end_vad: int) -> Optional[VADSegment]:
        """Extract a speech segment from the audio buffer.

        *start_vad* and *end_vad* are sample indices at the VAD rate.
        The returned audio stays at the input rate.
        """
        if end_vad <= start_vad:
            return None

        # Check minimum speech duration
        duration_s = (end_vad - start_vad) / self._vad_rate
        if duration_s * 1000 < self.min_speech_duration_ms:
            logger.debug("Segment too short: %.0f ms < %d ms",
                         duration_s * 1000, self.min_speech_duration_ms)
            return None

        # Convert VAD-rate indices to input-rate indices
        ratio = self._input_rate / self._vad_rate
        start_in = int(start_vad * ratio)
        end_in = int(end_vad * ratio)

        # Clamp to available audio
        start_in = max(0, start_in)
        end_in = min(len(self._audio_buffer), end_in)

        if end_in <= start_in:
            return None

        # Extract audio
        segment_samples = np.array(self._audio_buffer[start_in:end_in], dtype=np.float32)
        audio_bytes = _float32_to_pcm(segment_samples)

        # Compute confidence as mean of speech probabilities
        if self._speech_probs:
            confidence = float(np.mean(self._speech_probs))
        else:
            confidence = self.threshold

        start_sec = start_in / self._input_rate
        end_sec = end_in / self._input_rate

        return VADSegment(
            start=start_sec,
            end=end_sec,
            audio_bytes=audio_bytes,
            confidence=confidence,
        )

    def _trim_audio_buffer(self, end_vad: int) -> None:
        """Remove audio samples that have already been emitted as segments."""
        ratio = self._input_rate / self._vad_rate
        end_in = int(end_vad * ratio)
        end_in = min(len(self._audio_buffer), end_in)
        if end_in > 0:
            self._audio_buffer = self._audio_buffer[end_in:]
        # Also trim vad buffer proportionally
        vad_trim = min(len(self._vad_buffer), end_vad)
        if vad_trim > 0:
            self._vad_buffer = self._vad_buffer[vad_trim:]


# ---------------------------------------------------------------------------
# ASRProcessor
# ---------------------------------------------------------------------------


class ASRProcessor:
    """Transcribes audio segments using faster-whisper large-v3-turbo (INT8, CPU).

    The model is loaded once on instantiation and reused for all segments.
    Transient WAV files are written to a temp directory for the whisper
    transcribe() call, then deleted immediately.

    Parameters
    ----------
    model_size : str
        faster-whisper model name. Default ``large-v3-turbo``.
    device : str
        Inference device. Default ``cpu``.
    compute_type : str
        Quantisation type. Default ``int8``.
    """

    def __init__(
        self,
        model_size: str = "large-v3-turbo",
        device: str = "cpu",
        compute_type: str = "int8",
    ):
        from faster_whisper import WhisperModel

        logger.info("Loading faster-whisper model %s (device=%s, compute=%s) ...",
                    model_size, device, compute_type)
        self._model = WhisperModel(model_size, device=device, compute_type=compute_type)
        self._device = device
        self._compute_type = compute_type
        self._sample_rate = 16000  # faster-whisper expects 16 kHz
        logger.info("ASRProcessor ready")

    def transcribe_segment(self, audio_bytes: bytes, sample_rate: int = 8000) -> ASRSegment:
        """Transcribe a single speech segment (PCM 16-bit mono bytes).

        Parameters
        ----------
        audio_bytes : bytes
            Raw PCM 16-bit mono audio.
        sample_rate : int
            Sample rate of *audio_bytes*. Audio is resampled to 16 kHz
            internally because faster-whisper expects 16 kHz.

        Returns
        -------
        ASRSegment
            Transcribed text with average confidence.
        """
        if not audio_bytes:
            return ASRSegment(start=0.0, end=0.0, text="", confidence=0.0)

        # Compute duration before potential resample
        num_samples = len(audio_bytes) // BYTES_PER_SAMPLE
        duration_sec = num_samples / sample_rate if sample_rate > 0 else 0.0

        # Convert to 16 kHz mono WAV (faster-whisper requirement)
        wav_bytes = _bytes_to_wav(audio_bytes, sample_rate)

        # Resample to 16 kHz if needed
        if sample_rate != 16000:
            wav_bytes = self._resample_wav(wav_bytes, sample_rate, 16000)

        # Write to temp file (faster-whisper API requires a file path)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(wav_bytes)
            tmp_path = tmp.name

        try:
            segments, info = self._model.transcribe(tmp_path, beam_size=5)
            texts: list[str] = []
            confidences: list[float] = []
            seg_start = 0.0
            seg_end = duration_sec

            for seg in segments:
                texts.append(seg.text.strip())
                confidences.append(seg.avg_logprob if hasattr(seg, "avg_logprob") else 0.0)
                # Use the actual segment start/end if available
                if hasattr(seg, "start"):
                    seg_start = min(seg_start if seg_start > 0 else seg.start, seg.start)
                if hasattr(seg, "end"):
                    seg_end = max(seg_end, seg.end)

            text = "".join(texts)
            # Convert log-prob to confidence in [0, 1]
            if confidences:
                avg_logprob = float(np.mean(confidences))
                confidence = float(np.exp(avg_logprob))
            else:
                confidence = 0.0

            return ASRSegment(
                start=seg_start,
                end=seg_end,
                text=text,
                confidence=confidence,
            )
        except Exception:
            logger.exception("ASR transcription failed")
            return ASRSegment(
                start=0.0,
                end=duration_sec,
                text="",
                confidence=0.0,
            )
        finally:
            try:
                import os

                os.unlink(tmp_path)
            except OSError:
                pass

    @staticmethod
    def _resample_wav(wav_bytes: bytes, src_rate: int, dst_rate: int) -> bytes:
        """Resample a WAV container from *src_rate* to *dst_rate* using torchaudio."""
        try:
            import torchaudio
            import torchaudio.functional as F

            with io.BytesIO(wav_bytes) as buf:
                waveform, sr = torchaudio.load(buf)
            if sr != src_rate:
                waveform = F.resample(waveform, sr, dst_rate)
            else:
                waveform = F.resample(waveform, src_rate, dst_rate)
            out_buf = io.BytesIO()
            torchaudio.save(out_buf, waveform, dst_rate, format="wav")
            return out_buf.getvalue()
        except Exception:
            logger.warning("torchaudio resample failed for WAV; passing through")
            return wav_bytes


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
        Silero-VAD speech probability threshold.
    min_speech_duration_ms : int
        Minimum speech segment duration.
    max_speech_duration_s : float
        Maximum speech segment duration before force-split.
    enable_pyannote_check : bool
        If True, use pyannote VAD as a secondary false-positive filter.
    """

    def __init__(
        self,
        sample_rate: int = 8000,
        vad_threshold: float = 0.5,
        min_speech_duration_ms: int = 500,
        max_speech_duration_s: float = 10.0,
        enable_pyannote_check: bool = False,
    ):
        self.sample_rate = sample_rate

        self._vad = VADProcessor(
            sample_rate=sample_rate,
            threshold=vad_threshold,
            min_speech_duration_ms=min_speech_duration_ms,
            max_speech_duration_s=max_speech_duration_s,
        )
        self._asr = ASRProcessor()
        self._pyannote = _load_pyannote_vad() if enable_pyannote_check else None
        self._enable_pyannote = enable_pyannote_check

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
        vad_segments = self._vad.process_chunk(audio_bytes)

        results: list[ASRSegment] = []

        for vseg in vad_segments:
            # Step 2: Pyannote secondary check (best-effort)
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

            # Step 3: ASR transcription
            asr_seg = self._asr.transcribe_segment(
                vseg.audio_bytes, sample_rate=self.sample_rate
            )

            # Use VAD timestamps (more precise than ASR)
            asr_seg.start = self._processed_seconds + vseg.start
            asr_seg.end = self._processed_seconds + vseg.end

            if asr_seg.text.strip():
                results.append(asr_seg)

        return results

    def reset(self) -> None:
        """Reset the entire pipeline (VAD state, ASR model persists)."""
        self._vad.reset()
        self._processed_seconds = 0.0

    @property
    def total_seconds(self) -> float:
        """Total audio processed (seconds)."""
        return self._vad.total_seconds

    def transcribe_file(
        self, file_path: str, chunk_duration_s: float = 0.5
    ) -> list[ASRSegment]:
        """Convenience: transcribe an entire audio file by streaming it
        through the pipeline in *chunk_duration_s*-second chunks.

        Parameters
        ----------
        file_path : str
            Path to a WAV file (16-bit PCM mono, any sample rate).
        chunk_duration_s : float
            Duration of each streaming chunk in seconds.

        Returns
        -------
        list[ASRSegment]
        """
        import wave as wav_mod

        self.reset()

        with wav_mod.open(file_path, "rb") as wf:
            file_rate = wf.getframerate()
            results: list[ASRSegment] = []

            chunk_frames = int(file_rate * chunk_duration_s)
            while True:
                data = wf.readframes(chunk_frames)
                if not data:
                    break

                # Resample to engine rate if needed
                if file_rate != self.sample_rate:
                    data = self._resample_pcm(data, file_rate, self.sample_rate)

                results.extend(self.feed_chunk(data))

        return results

    @staticmethod
    def _resample_pcm(pcm_bytes: bytes, src_rate: int, dst_rate: int) -> bytes:
        """Resample raw PCM 16-bit mono bytes."""
        if not pcm_bytes or src_rate == dst_rate:
            return pcm_bytes
        samples = _pcm_to_float32(pcm_bytes)
        try:
            import torchaudio.functional as F

            t = torch.from_numpy(samples).unsqueeze(0)
            resampled = F.resample(t, src_rate, dst_rate)
            return _float32_to_pcm(resampled.squeeze(0).numpy())
        except Exception:
            # Crude linear interpolation fallback
            ratio = dst_rate / src_rate
            out_len = max(1, int(len(samples) * ratio))
            indices = np.linspace(0, len(samples) - 1, out_len)
            resampled = np.interp(indices, np.arange(len(samples)), samples).astype(np.float32)
            return _float32_to_pcm(resampled)
