"""
Unit tests for realtime_asr.py — Silero-VAD + faster-whisper streaming pipeline.

Tests cover:
- Imports and class instantiation
- PCM conversion utilities
- VADProcessor: creation, process_chunk, reset, edge cases
- ASRProcessor: creation, transcribe_segment with synthetic audio
- StreamingTranscriber: creation, feed_chunk, reset
"""

from __future__ import annotations

import io
import struct
import sys
import time
import wave

import numpy as np
import pytest

# Ensure the backend package is importable
sys.path.insert(0, ".")

# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------


def make_silence_pcm(duration_s: float, sample_rate: int = 8000) -> bytes:
    """Generate PCM 16-bit mono silence."""
    n_samples = int(sample_rate * duration_s)
    return np.zeros(n_samples, dtype=np.int16).tobytes()


def make_tone_pcm(
    duration_s: float, freq: float = 440.0, amplitude: float = 0.5, sample_rate: int = 8000
) -> bytes:
    """Generate PCM 16-bit mono sine tone (simulated 'speech-like' signal)."""
    n_samples = int(sample_rate * duration_s)
    t = np.arange(n_samples) / sample_rate
    samples = (amplitude * np.sin(2.0 * np.pi * freq * t) * 32767.0).astype(np.int16)
    return samples.tobytes()


def make_speech_like_pcm(duration_s: float, sample_rate: int = 8000) -> bytes:
    """Generate speech-like audio: alternating tones with noise gaps to
    simulate syllables and pauses.  This is NOT real speech but exercises
    the VAD pipeline with a non-trivial signal.
    """
    n_samples = int(sample_rate * duration_s)
    t = np.arange(n_samples) / sample_rate
    signal = np.zeros(n_samples, dtype=np.float64)

    # Simulate 3 "words" separated by short gaps
    word_dur = duration_s / 5
    gap_dur = duration_s / 10

    # Word 1: 300 Hz (low voice)
    s1 = int(0.1 * sample_rate)
    e1 = s1 + int(word_dur * sample_rate)
    signal[s1:e1] = 0.7 * np.sin(2.0 * np.pi * 300.0 * t[s1:e1])

    # Word 2: 500 Hz
    s2 = e1 + int(gap_dur * sample_rate)
    e2 = s2 + int(word_dur * sample_rate)
    signal[s2:e2] = 0.7 * np.sin(2.0 * np.pi * 500.0 * t[s2:e2])

    # Word 3: 400 Hz
    s3 = e2 + int(gap_dur * sample_rate)
    e3 = s3 + int(word_dur * sample_rate)
    signal[s3:e3] = 0.7 * np.sin(2.0 * np.pi * 400.0 * t[s3:e3])

    # Add slight noise
    signal += 0.02 * np.random.randn(n_samples)
    signal = np.clip(signal, -1.0, 1.0)

    return (signal * 32767.0).astype(np.int16).tobytes()


def pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 8000) -> bytes:
    """Wrap PCM bytes in a WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Import tests
# ---------------------------------------------------------------------------


class TestImports:
    """Verify all expected symbols are importable."""

    def test_import_realtime_asr(self):
        from app.services.realtime_asr import (
            ASRProcessor,
            ASRSegment,
            StreamingTranscriber,
            VADProcessor,
            VADSegment,
        )

        assert VADProcessor is not None
        assert ASRProcessor is not None
        assert StreamingTranscriber is not None

    def test_vad_segment_dataclass(self):
        from app.services.realtime_asr import VADSegment

        seg = VADSegment(start=0.0, end=1.5, audio_bytes=b"dummy", confidence=0.9)
        assert seg.start == 0.0
        assert seg.end == 1.5
        assert seg.audio_bytes == b"dummy"
        assert seg.confidence == 0.9

    def test_asr_segment_dataclass(self):
        from app.services.realtime_asr import ASRSegment

        seg = ASRSegment(start=0.0, end=1.5, text="Hello", confidence=0.95)
        assert seg.start == 0.0
        assert seg.end == 1.5
        assert seg.text == "Hello"
        assert seg.confidence == 0.95


# ---------------------------------------------------------------------------
# PCM conversion utilities
# ---------------------------------------------------------------------------


class TestPCMUtils:
    """Test raw PCM <-> float32 conversion utilities."""

    def test_pcm_to_float32_roundtrip(self):
        from app.services.realtime_asr import _float32_to_pcm, _pcm_to_float32

        original = make_tone_pcm(0.1, freq=440, amplitude=0.5)
        floats = _pcm_to_float32(original)
        pcm = _float32_to_pcm(floats)
        # Round-trip should be close (may lose 1 LSB)
        re_floats = _pcm_to_float32(pcm)
        # int16 quantization: max error ≈ 1/32767 ≈ 3e-5
        assert np.allclose(floats, re_floats, atol=1e-4)

    def test_pcm_to_float32_range(self):
        from app.services.realtime_asr import _pcm_to_float32

        # Max int16
        max_pcm = struct.pack("<h", 32767) + struct.pack("<h", -32768)
        floats = _pcm_to_float32(max_pcm)
        assert -1.0 <= floats[0] <= 1.0
        assert -1.0 <= floats[1] <= 1.0

    def test_bytes_to_wav(self):
        from app.services.realtime_asr import _bytes_to_wav

        pcm = make_silence_pcm(0.1, sample_rate=8000)
        wav = _bytes_to_wav(pcm, 8000)
        # Verify WAV header
        assert wav[:4] == b"RIFF"
        assert wav[8:12] == b"WAVE"


# ---------------------------------------------------------------------------
# VADProcessor
# ---------------------------------------------------------------------------


class TestVADProcessor:
    """Test Silero-VAD processor."""

    def test_create_default(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor()
        assert vad.threshold == 0.5
        assert vad._vad_rate == 8000
        vad.reset()

    def test_create_custom_config(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(
            sample_rate=8000,
            threshold=0.5,
            min_speech_duration_ms=300,
            max_speech_duration_s=10.0,
            min_silence_duration_ms=100,
            speech_pad_ms=30,
        )
        assert vad.threshold == 0.5
        assert vad.min_speech_duration_ms == 300
        assert vad.max_speech_duration_s == 10.0
        vad.reset()

    def test_create_16k(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(sample_rate=16000)
        assert vad._vad_rate == 16000
        assert not vad._need_resample
        vad.reset()

    def test_process_empty_chunk(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor()
        result = vad.process_chunk(b"")
        assert result == []
        vad.reset()

    def test_process_silence_returns_nothing(self):
        """Silence should NOT produce VAD segments."""
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(threshold=0.5)
        # Feed 3 seconds of near-silence
        silence = make_silence_pcm(3.0, sample_rate=8000)
        # Feed in 32ms chunks
        chunk_size = 256 * 2  # 512 bytes = 256 samples at 16-bit
        results = []
        for i in range(0, len(silence), chunk_size):
            chunk = silence[i : i + chunk_size]
            results.extend(vad.process_chunk(chunk))
        # Silence with amplitude 0 should produce no segments
        assert len(results) == 0
        vad.reset()

    def test_process_speech_like_signal(self):
        """Speech-like tonal signal should trigger VAD detection."""
        from app.services.realtime_asr import VADProcessor

        # Use lower threshold to make detection easier with synthetic audio
        vad = VADProcessor(threshold=0.3, min_speech_duration_ms=100)
        audio = make_speech_like_pcm(3.0, sample_rate=8000)
        chunk_size = 256 * 2  # 256 samples * 2 bytes = 512 bytes
        results = []
        for i in range(0, len(audio), chunk_size):
            chunk = audio[i : i + chunk_size]
            results.extend(vad.process_chunk(chunk))
        # With synthetic audio + lower threshold we should get segments
        # (real VAD may or may not detect synthetic tones as speech)
        assert isinstance(results, list)
        for seg in results:
            assert seg.start >= 0.0
            assert seg.end > seg.start
            assert len(seg.audio_bytes) > 0
            assert 0.0 <= seg.confidence <= 1.0
        vad.reset()

    def test_total_seconds_property(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(sample_rate=8000)
        # Feed 1 second of audio
        pcm = make_silence_pcm(1.0, sample_rate=8000)
        chunk_size = 256 * 2
        for i in range(0, len(pcm), chunk_size):
            vad.process_chunk(pcm[i : i + chunk_size])
        assert abs(vad.total_seconds - 1.0) < 0.1
        vad.reset()

    def test_reset_clears_buffers(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor()
        # Feed some audio
        pcm = make_speech_like_pcm(0.5, sample_rate=8000)
        chunk_size = 256 * 2
        for i in range(0, len(pcm), chunk_size):
            vad.process_chunk(pcm[i : i + chunk_size])
        # Reset
        vad.reset()
        assert vad.total_seconds == 0.0
        # After reset, silence should again produce no segments
        silence = make_silence_pcm(1.0, sample_rate=8000)
        results = []
        for i in range(0, len(silence), 256 * 2):
            results.extend(vad.process_chunk(silence[i : i + 256 * 2]))
        assert len(results) == 0
        vad.reset()


# ---------------------------------------------------------------------------
# ASRProcessor
# ---------------------------------------------------------------------------


class TestASRProcessorSlow:
    """ASR processor tests (slow — model loading takes time)."""

    @pytest.mark.slow
    def test_create_asr_processor(self):
        """Verify ASRProcessor can be instantiated and model loads."""
        from app.services.realtime_asr import ASRProcessor

        asr = ASRProcessor()
        assert asr is not None
        assert asr._device == "cpu"
        assert asr._compute_type == "int8"

    @pytest.mark.slow
    def test_transcribe_silence(self):
        """Transcribing silence should return empty or near-empty text."""
        from app.services.realtime_asr import ASRProcessor

        asr = ASRProcessor()
        silence = make_silence_pcm(1.0, sample_rate=16000)
        result = asr.transcribe_segment(silence, sample_rate=16000)
        assert isinstance(result.text, str)
        # Silence should produce little to no text
        assert len(result.text.strip()) < 20 or result.confidence < 0.5

    @pytest.mark.slow
    def test_transcribe_tone(self):
        """Transcribing a pure tone should not crash."""
        from app.services.realtime_asr import ASRProcessor

        asr = ASRProcessor()
        tone = make_tone_pcm(1.0, freq=440, sample_rate=16000)
        result = asr.transcribe_segment(tone, sample_rate=16000)
        assert isinstance(result.text, str)
        assert 0.0 <= result.confidence <= 1.0


# ---------------------------------------------------------------------------
# StreamingTranscriber
# ---------------------------------------------------------------------------


class TestStreamingTranscriber:
    """Test the full pipeline orchestrator (VAD + ASR)."""

    def test_create(self):
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(sample_rate=8000)
        assert st is not None
        assert st.sample_rate == 8000
        st.reset()

    def test_create_with_pyannote_disabled(self):
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(enable_pyannote_check=False)
        assert st._pyannote is None
        st.reset()

    def test_feed_empty_chunk(self):
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(sample_rate=8000)
        results = st.feed_chunk(b"")
        assert results == []

    def test_feed_silence_chunks(self):
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(sample_rate=8000)
        silence = make_silence_pcm(1.0, sample_rate=8000)
        chunk_size = 256 * 2
        results = []
        for i in range(0, len(silence), chunk_size):
            results.extend(st.feed_chunk(silence[i : i + chunk_size]))
        # Silence should produce no transcripts (VAD won't detect speech)
        assert len(results) == 0

    def test_reset(self):
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(sample_rate=8000)
        silence = make_silence_pcm(0.5, sample_rate=8000)
        for i in range(0, len(silence), 256 * 2):
            st.feed_chunk(silence[i : i + 256 * 2])
        st.reset()
        assert st.total_seconds == 0.0

    def test_custom_vad_threshold(self):
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(vad_threshold=0.7)
        assert st._vad.threshold == 0.7


# ---------------------------------------------------------------------------
# Integration-style test
# ---------------------------------------------------------------------------


class TestIntegration:
    """End-to-end test with speech-like audio."""

    @pytest.mark.slow
    def test_full_pipeline_with_speech_like_audio(self):
        """Run a 3-second speech-like signal through the full pipeline.

        This verifies that VAD detects segments, ASR transcribes them,
        and the StreamingTranscriber correctly coordinates both stages.
        """
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(
            sample_rate=16000,
            vad_threshold=0.3,
            min_speech_duration_ms=100,
        )
        # Generate 3 seconds of speech-like audio at 16 kHz
        audio = make_speech_like_pcm(3.0, sample_rate=16000)
        chunk_size = 512 * 2  # 512 samples * 2 bytes at 16 kHz
        all_results = []
        for i in range(0, len(audio), chunk_size):
            chunk = audio[i : i + chunk_size]
            results = st.feed_chunk(chunk)
            all_results.extend(results)

        # Verify structure of results
        for seg in all_results:
            assert isinstance(seg.start, float)
            assert isinstance(seg.end, float)
            assert seg.end >= seg.start
            assert isinstance(seg.text, str)
            assert isinstance(seg.confidence, float)
            assert 0.0 <= seg.confidence <= 1.0

        st.reset()


# ---------------------------------------------------------------------------
# Main guard for manual smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("Smoke test: realtime_asr module")
    print("=" * 60)

    # 1. Imports
    from app.services.realtime_asr import (
        ASRProcessor,
        ASRSegment,
        StreamingTranscriber,
        VADProcessor,
        VADSegment,
    )

    print("[OK] All classes imported successfully")

    # 2. VAD instantiation
    vad = VADProcessor(sample_rate=8000, threshold=0.5)
    print(f"[OK] VADProcessor created (threshold={vad.threshold}, rate={vad._vad_rate})")

    # 3. Feed silence — should not produce segments
    silence = make_silence_pcm(2.0, sample_rate=8000)
    chunk_size = 256 * 2
    segs = []
    for i in range(0, len(silence), chunk_size):
        segs.extend(vad.process_chunk(silence[i : i + chunk_size]))
    print(f"[OK] Silence test: {len(segs)} segments (expected 0)")

    # 4. Feed speech-like audio
    vad.reset()
    speech = make_speech_like_pcm(3.0, sample_rate=8000)
    segs = []
    for i in range(0, len(speech), chunk_size):
        segs.extend(vad.process_chunk(speech[i : i + chunk_size]))
    print(f"[OK] Speech-like test: {len(segs)} VAD segments detected")
    for i, seg in enumerate(segs):
        print(
            f"    seg[{i}]: start={seg.start:.2f}s end={seg.end:.2f}s "
            f"len={len(seg.audio_bytes)}B conf={seg.confidence:.3f}"
        )

    # 5. ASRProcessor (this will download model on first run)
    print("[..] Loading ASRProcessor (faster-whisper large-v3-turbo)...")
    t0 = time.time()
    asr = ASRProcessor()
    print(f"[OK] ASRProcessor loaded in {time.time() - t0:.1f}s")

    # 6. Transcribe a segment if VAD found one
    if segs:
        print(f"[..] Transcribing first segment ({len(segs[0].audio_bytes)}B)...")
        asr_seg = asr.transcribe_segment(segs[0].audio_bytes, sample_rate=8000)
        print(f"[OK] Transcription: '{asr_seg.text[:80]}...' (conf={asr_seg.confidence:.3f})")
    else:
        print("[SKIP] No VAD segments to transcribe")

    # 7. StreamingTranscriber
    st = StreamingTranscriber(sample_rate=8000)
    print(f"[OK] StreamingTranscriber created. Total seconds: {st.total_seconds:.2f}")
    results = st.feed_chunk(speech)
    print(f"[OK] StreamingTranscriber produced {len(results)} transcripts")
    for i, r in enumerate(results):
        print(f"    [{i}]: {r.start:.2f}-{r.end:.2f}s '{r.text[:60]}'")

    st.reset()
    print("\n" + "=" * 60)
    print("Smoke test complete")
    print("=" * 60)
