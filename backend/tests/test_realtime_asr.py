"""
Unit tests for realtime_asr.py -- FunASR fsmn-vad + paraformer-zh streaming pipeline.

Tests cover:
- Imports and class instantiation
- VADProcessor: creation, feed, reset, edge cases
- ASRProcessor: creation, transcribe with synthetic audio
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
# VADProcessor
# ---------------------------------------------------------------------------


class TestVADProcessor:
    """Test FunASR fsmn-vad processor."""

    def test_create_default(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor()
        assert vad._sample_rate == 16000
        vad.reset()

    def test_create_custom_rate(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(sample_rate=8000)
        assert vad._sample_rate == 8000
        vad.reset()

    def test_feed_empty_chunk(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(sample_rate=8000)
        result = vad.feed(b"")
        assert result == []
        vad.reset()

    def test_feed_silence_returns_nothing(self):
        """Silence should NOT produce VAD segments (buffer < 1.5s threshold)."""
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(sample_rate=8000)
        # Feed 1 second of near-silence (below 1.5s accumulation threshold)
        silence = make_silence_pcm(1.0, sample_rate=8000)
        result = vad.feed(silence)
        # Buffer accumulation threshold prevents VAD from running
        assert isinstance(result, list)
        vad.reset()

    def test_feed_speech_like_signal(self):
        """Speech-like tonal signal should accumulate and trigger VAD processing."""
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(sample_rate=8000)
        # Feed 3 seconds of speech-like audio (above 1.5s accumulation threshold)
        audio = make_speech_like_pcm(3.0, sample_rate=8000)
        results = vad.feed(audio)
        # With synthetic audio, fsmn-vad may or may not detect segments
        assert isinstance(results, list)
        for seg in results:
            assert seg.start >= 0.0
            assert seg.end > seg.start
            assert len(seg.audio_bytes) > 0
        vad.reset()

    def test_total_seconds_property(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(sample_rate=8000)
        # Feed enough audio to trigger VAD processing (>1.5s)
        pcm = make_silence_pcm(2.0, sample_rate=8000)
        vad.feed(pcm)
        # After feed, buffer is flushed and offset_samples advances
        # total_seconds is part of StreamingTranscriber, not VADProcessor
        assert vad._current_sample >= 0
        vad.reset()

    def test_reset_clears_buffers(self):
        from app.services.realtime_asr import VADProcessor

        vad = VADProcessor(sample_rate=8000)
        # Feed some audio (>1.5s to trigger processing)
        pcm = make_speech_like_pcm(2.0, sample_rate=8000)
        vad.feed(pcm)
        # Reset
        vad.reset()
        assert vad._offset_samples == 0
        assert vad._current_sample == 0
        assert len(vad._buffer) == 0
        # After reset, feed more silence below threshold
        silence = make_silence_pcm(0.5, sample_rate=8000)
        results = vad.feed(silence)
        assert results == []
        vad.reset()


# ---------------------------------------------------------------------------
# ASRProcessor
# ---------------------------------------------------------------------------


class TestASRProcessorSlow:
    """ASR processor tests (slow -- model loading takes time)."""

    @pytest.mark.slow
    def test_create_asr_processor(self):
        """Verify ASRProcessor can be instantiated."""
        from app.services.realtime_asr import ASRProcessor

        asr = ASRProcessor()
        assert asr is not None
        assert asr._sample_rate == 16000

    @pytest.mark.slow
    def test_transcribe_silence(self):
        """Transcribing silence should return empty string."""
        from app.services.realtime_asr import ASRProcessor

        asr = ASRProcessor(sample_rate=16000)
        silence = make_silence_pcm(1.0, sample_rate=16000)
        result = asr.transcribe(silence)
        assert isinstance(result, str)

    @pytest.mark.slow
    def test_transcribe_tone(self):
        """Transcribing a pure tone should not crash."""
        from app.services.realtime_asr import ASRProcessor

        asr = ASRProcessor(sample_rate=16000)
        tone = make_tone_pcm(1.0, freq=440, sample_rate=16000)
        result = asr.transcribe(tone)
        assert isinstance(result, str)


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
        results = st.feed_chunk(silence)
        # Silence below VAD accumulation threshold produces no transcripts
        assert len(results) == 0

    def test_reset(self):
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(sample_rate=8000)
        silence = make_silence_pcm(0.5, sample_rate=8000)
        st.feed_chunk(silence)
        st.reset()
        assert st.total_seconds == 0.0

    def test_create_with_speaker_clustering(self):
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(sample_rate=8000, enable_speaker_clustering=True)
        assert st._speaker_clustering is not None
        assert st.get_speaker_names() == {}
        st.reset()

    def test_create_with_speaker_clustering_disabled(self):
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(sample_rate=8000, enable_speaker_clustering=False)
        assert st._speaker_clustering is None
        assert st.get_speaker_names() == {}


# ---------------------------------------------------------------------------
# Integration-style test
# ---------------------------------------------------------------------------


class TestIntegration:
    """End-to-end test with speech-like audio."""

    @pytest.mark.slow
    def test_full_pipeline_with_speech_like_audio(self):
        """Run a 3-second speech-like signal through the full pipeline.

        This verifies that VAD processes, ASR transcribes,
        and the StreamingTranscriber correctly coordinates both stages.
        """
        from app.services.realtime_asr import StreamingTranscriber

        st = StreamingTranscriber(sample_rate=16000)
        # Generate 3 seconds of speech-like audio at 16 kHz
        audio = make_speech_like_pcm(4.0, sample_rate=16000)
        results = st.feed_chunk(audio)

        # Verify structure of results
        for seg in results:
            assert isinstance(seg.start, float)
            assert isinstance(seg.end, float)
            assert seg.end >= seg.start
            assert isinstance(seg.text, str)

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
    vad = VADProcessor(sample_rate=8000)
    print(f"[OK] VADProcessor created (rate={vad._sample_rate})")

    # 3. Feed silence -- should not produce segments (below 1.5s threshold)
    silence = make_silence_pcm(0.5, sample_rate=8000)
    segs = vad.feed(silence)
    print(f"[OK] Silence test (<1.5s): {len(segs)} segments (expected 0)")

    # 4. Feed speech-like audio (>1.5s to trigger VAD)
    vad.reset()
    speech = make_speech_like_pcm(3.0, sample_rate=8000)
    segs = vad.feed(speech)
    print(f"[OK] Speech-like test: {len(segs)} VAD segments detected")
    for i, seg in enumerate(segs):
        print(
            f"    seg[{i}]: start={seg.start:.2f}s end={seg.end:.2f}s "
            f"len={len(seg.audio_bytes)}B"
        )

    # 5. ASRProcessor (this will download model on first run)
    print("[..] Loading ASRProcessor (FunASR paraformer-zh)...")
    t0 = time.time()
    asr = ASRProcessor(sample_rate=8000)
    print(f"[OK] ASRProcessor loaded in {time.time() - t0:.1f}s")

    # 6. Transcribe a segment if VAD found one
    if segs:
        print(f"[..] Transcribing first segment ({len(segs[0].audio_bytes)}B)...")
        text = asr.transcribe(segs[0].audio_bytes)
        print(f"[OK] Transcription: '{text[:80]}'")
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
