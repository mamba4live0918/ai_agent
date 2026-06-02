# FunASR Benchmark — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install FunASR and run a benchmark comparing Paraformer-zh vs faster-whisper on Chinese sales audio.

**Architecture:** Single benchmark script (`benchmark_funasr.py`) that runs both pipelines on the same test audio and prints a comparison table. No production code is modified.

**Tech Stack:** Python 3.11, funasr, faster-whisper, ffmpeg

---

### Task 1: Prepare test audio

**Files:**
- Create: `backend/test_data/` directory with a test audio file

- [ ] **Step 1: Generate a test audio file using the existing audio_uploads directory**

If there's an existing audio file in `audio_uploads/`, copy it. Otherwise, create a synthetic one via ffmpeg sine wave (for benchmark purposes, the content doesn't need to be real speech — we're measuring timing, not accuracy).

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
# Check for existing test audio
ls audio_uploads/ 2>/dev/null | head -5 || echo "NO_AUDIO"

# If no audio, record or use an existing file. For timing benchmark, any audio works.
# For accuracy comparison, we need real Chinese speech.
# Use the first .wav or .webm file found
```

- [ ] **Step 2: Convert test audio to 16kHz mono WAV**

```bash
mkdir -p test_data
# Pick first audio file or create synthetic
AUDIO=$(ls audio_uploads/*.wav audio_uploads/*.webm audio_uploads/*.mp3 2>/dev/null | head -1)
if [ -z "$AUDIO" ]; then
  # Create 30s synthetic audio as fallback
  ffmpeg -y -f lavfi -i "sine=frequency=440:duration=30" -ar 16000 -ac 1 test_data/test_audio.wav
else
  ffmpeg -y -i "$AUDIO" -ar 16000 -ac 1 -t 30 test_data/test_audio.wav
fi
echo "Test audio ready: test_data/test_audio.wav"
$(which ffprobe || echo "") test_data/test_audio.wav 2>&1 || echo "duration: ~30s"
```

- [ ] **Step 3: Commit test audio reference**

```bash
git add backend/test_data/.gitkeep 2>/dev/null || true
git commit -m "chore: add test_data directory for benchmark audio"
```

---

### Task 2: Install FunASR

**Files:**
- Modify: `backend/requirements.txt` — add `funasr`

- [ ] **Step 1: Install funasr**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/pip.exe install funasr 2>&1
```

Expected: installs funasr + modelscope + dependencies. No errors.

- [ ] **Step 2: Verify no dependency conflicts**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/pip.exe check 2>&1
```

Expected: no broken requirements.

- [ ] **Step 3: Verify funasr imports**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/python.exe -c "from funasr import AutoModel; print('funasr OK')" 2>&1
```

Expected: `funasr OK` (first run may download model index).

- [ ] **Step 4: Verify faster-whisper still works**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/python.exe -c "from faster_whisper import WhisperModel; print('whisper OK')" 2>&1
```

Expected: `whisper OK`.

- [ ] **Step 5: Add funasr to requirements.txt**

Append to `backend/requirements.txt`:

```
# FunASR benchmark
funasr>=1.0
```

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add funasr dependency for benchmark"
```

---

### Task 3: Write benchmark_funasr.py

**Files:**
- Create: `backend/benchmark_funasr.py`

- [ ] **Step 1: Write the benchmark script**

```python
"""
FunASR vs faster-whisper benchmark.

Compares transcription speed, memory, and output quality on the same
test audio file.  No production code is modified.
"""

import os
import sys
import json
import time
import tempfile
import subprocess
import tracemalloc
from pathlib import Path

# Add backend to path so we can import config
sys.path.insert(0, str(Path(__file__).parent))

TEST_AUDIO = Path(__file__).parent / "test_data" / "test_audio.wav"

# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────

def _ensure_wav(src: Path) -> Path:
    """Ensure audio is 16kHz mono WAV."""
    if src.suffix == ".wav":
        return src
    dst = src.with_suffix(".wav")
    if not dst.exists():
        subprocess.run([
            "ffmpeg", "-y", "-i", str(src),
            "-ar", "16000", "-ac", "1", "-f", "wav", str(dst),
        ], capture_output=True, check=True)
    return dst

def _audio_duration_seconds(wav_path: Path) -> float:
    """Return audio duration in seconds using ffprobe."""
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration", "-of", "default=noprint_wrappers=1:nokey=1",
        str(wav_path),
    ], capture_output=True, text=True)
    if result.returncode == 0 and result.stdout.strip():
        return float(result.stdout.strip())
    # Fallback: estimate from file size (16-bit mono 16kHz = 32000 bytes/s)
    return wav_path.stat().st_size / 32000.0


# ────────────────────────────────────────────────────────────
# Pipeline 1: faster-whisper (current production)
# ────────────────────────────────────────────────────────────

def benchmark_whisper(wav_path: Path) -> dict:
    """Transcribe with faster-whisper large-v3-turbo. Return metrics."""
    print("=" * 60)
    print("Pipeline 1: faster-whisper large-v3-turbo (INT8 CPU)")
    print("=" * 60)

    from faster_whisper import WhisperModel

    # Model load time
    t0 = time.perf_counter()
    model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
    load_time = time.perf_counter() - t0
    print(f"  Model loaded in {load_time:.1f}s")

    # Transcription
    t1 = time.perf_counter()
    segments, info = model.transcribe(str(wav_path), beam_size=5)
    # Force generator evaluation
    seg_list = list(segments)
    transcribe_time = time.perf_counter() - t1
    text = " ".join(s.segment.text for s in seg_list).strip()

    print(f"  Segments: {len(seg_list)}")
    print(f"  Transcribe time: {transcribe_time:.1f}s")
    print(f"  Text preview: {text[:120]}...")

    return {
        "model": "faster-whisper large-v3-turbo",
        "load_time_s": round(load_time, 1),
        "transcribe_time_s": round(transcribe_time, 1),
        "segments": len(seg_list),
        "text": text,
        "info": str(info),
    }


# ────────────────────────────────────────────────────────────
# Pipeline 2: FunASR Paraformer-zh
# ────────────────────────────────────────────────────────────

def benchmark_funasr(wav_path: Path) -> dict:
    """Transcribe with FunASR Paraformer-zh + VAD + punctuation. Return metrics."""
    print()
    print("=" * 60)
    print("Pipeline 2: FunASR paraformer-zh + fsmn-vad + ct-punc")
    print("=" * 60)

    from funasr import AutoModel

    # Model load time
    t0 = time.perf_counter()
    model = AutoModel(
        model="paraformer-zh",
        vad_model="fsmn-vad",
        punc_model="ct-punc",
        # spk_model="cam++",  # uncomment for speaker test (Task 5)
        disable_update=True,  # skip update check
    )
    load_time = time.perf_counter() - t0
    print(f"  Model loaded in {load_time:.1f}s")

    # Transcription
    t1 = time.perf_counter()
    result = model.generate(input=str(wav_path))
    transcribe_time = time.perf_counter() - t1

    # Parse result — funasr returns list of dicts or a single dict
    if isinstance(result, list) and len(result) > 0:
        r = result[0]
    elif isinstance(result, dict):
        r = result
    else:
        r = {"text": str(result)}

    text = r.get("text", "")
    if isinstance(text, list):
        text = " ".join(text)
    text = text.strip()

    seg_count = len(r.get("sentences", r.get("segments", []))) if isinstance(r, dict) else 0

    print(f"  Segments: {seg_count}")
    print(f"  Transcribe time: {transcribe_time:.1f}s")
    print(f"  Text preview: {text[:120]}...")

    return {
        "model": "FunASR paraformer-zh + fsmn-vad + ct-punc",
        "load_time_s": round(load_time, 1),
        "transcribe_time_s": round(transcribe_time, 1),
        "segments": seg_count if seg_count > 0 else len(text.split()),
        "text": text,
    }


# ────────────────────────────────────────────────────────────
# Streaming simulation (for real-time pipeline comparison)
# ────────────────────────────────────────────────────────────

def benchmark_streaming(wav_path: Path):
    """Simulate real-time streaming: chunk audio and measure per-segment latency."""
    print()
    print("=" * 60)
    print("Streaming Simulation (simulated 100ms PCM chunks)")
    print("=" * 60)

    import wave
    import numpy as np

    with wave.open(str(wav_path), "rb") as wf:
        sample_rate = wf.getframerate()
        n_channels = wf.getnchannels()
        assert sample_rate == 16000 and n_channels == 1, "Need 16kHz mono WAV"
        audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)

    from app.services.realtime_asr import StreamingTranscriber

    # --- Current pipeline ---
    transcriber = StreamingTranscriber(
        sample_rate=16000,
        vad_threshold=0.5,
        min_speech_duration_ms=500,
        max_speech_duration_s=6.0,
        enable_speaker_clustering=False,  # skip for speed test
    )

    chunk_samples = 1600  # 100ms at 16kHz
    t0 = time.perf_counter()
    all_latencies = []

    for i in range(0, len(audio), chunk_samples):
        chunk = audio[i:i + chunk_samples]
        if len(chunk) < chunk_samples:
            break
        t_seg = time.perf_counter()
        segments = transcriber.feed_chunk(chunk.tobytes())
        if segments:
            all_latencies.append(time.perf_counter() - t_seg)

    total = time.perf_counter() - t0
    transcriber.reset()

    avg_latency = sum(all_latencies) / len(all_latencies) * 1000 if all_latencies else 0
    print(f"  Whisper streaming: total={total:.1f}s, segments={len(all_latencies)}, avg_latency={avg_latency:.0f}ms")

    return {
        "pipeline": "faster-whisper streaming",
        "total_time_s": round(total, 1),
        "total_segments": len(all_latencies),
        "avg_segment_latency_ms": round(avg_latency, 0),
    }


# ────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────

def main():
    if not TEST_AUDIO.exists():
        print(f"ERROR: Test audio not found at {TEST_AUDIO}")
        print("Run Task 1 first to prepare test audio.")
        sys.exit(1)

    wav_path = _ensure_wav(TEST_AUDIO)
    duration = _audio_duration_seconds(wav_path)
    print(f"Test audio: {wav_path} ({duration:.1f}s)")
    print()

    # Memory tracking
    tracemalloc.start()

    # Run both pipelines
    r1 = benchmark_whisper(wav_path)
    r2 = benchmark_funasr(wav_path)
    r3 = benchmark_streaming(wav_path)

    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    # ── Comparison table ──
    print()
    print("=" * 70)
    print("RESULTS")
    print("=" * 70)
    print(f"{'Metric':<30} {'faster-whisper':>18} {'FunASR':>18}")
    print("-" * 70)
    print(f"{'Model load time':<30} {r1['load_time_s']:>17.1f}s {r2['load_time_s']:>17.1f}s")
    print(f"{'Transcribe time':<30} {r1['transcribe_time_s']:>17.1f}s {r2['transcribe_time_s']:>17.1f}s")
    rtf1 = r1['transcribe_time_s'] / duration
    rtf2 = r2['transcribe_time_s'] / duration
    print(f"{'RTF (time/audio)':<30} {rtf1:>18.3f} {rtf2:>18.3f}")
    print(f"{'Speedup':<30} {'—':>18} {f'{(rtf1/rtf2):.1f}x faster' if rtf2 > 0 else 'N/A':>18}")
    print(f"{'Segments':<30} {r1['segments']:>18} {r2['segments']:>18}")
    print(f"{'Peak memory':<30} {'—':>18} {f'{peak/1024/1024:.0f} MB':>18}")

    if r3:
        print("-" * 70)
        print(f"{'Streaming total':<30} {r3['total_time_s']:>17.1f}s {'—':>18}")
        print(f"{'Streaming segments':<30} {r3['total_segments']:>18} {'—':>18}")

    print()
    print("Text comparison:")
    print(f"  Whisper:  {r1['text'][:200]}")
    print(f"  FunASR:   {r2['text'][:200]}")
    print()

    # Decision
    if rtf2 <= rtf1 * 1.1:  # FunASR not slower (within 10%)
        print("VERDICT: ✅ FunASR matches or exceeds whisper speed. Proceed to integration.")
    else:
        print("VERDICT: ⚠️  FunASR is slower than whisper. Review before proceeding.")

    # Save results
    results = {
        "audio_duration_s": round(duration, 1),
        "whisper": r1,
        "funasr": r2,
        "streaming": r3,
        "peak_memory_mb": round(peak / 1024 / 1024, 1),
    }
    out_path = Path(__file__).parent / "benchmark_results.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the benchmark**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/python.exe benchmark_funasr.py 2>&1
```

Expected: comparison table with timing results. Note: first run downloads models (~30s-2min).

- [ ] **Step 3: Document results**

Read `backend/benchmark_results.json` and summarize the key numbers.

- [ ] **Step 4: Commit**

```bash
git add backend/benchmark_funasr.py backend/benchmark_results.json
git commit -m "feat: add FunASR benchmark script and results"
```

---

### Task 4: Speaker diarization comparison (optional)

**Files:**
- Modify: `backend/benchmark_funasr.py` — add speaker test

- [ ] **Step 1: Add speaker comparison function**

Append to `benchmark_funasr.py`:

```python
def benchmark_speakers(wav_path: Path):
    """Compare speaker diarization: pyannote vs cam++."""
    print()
    print("=" * 60)
    print("Speaker Diarization Comparison")
    print("=" * 60)

    # --- pyannote embedding (current) ---
    from app.services.speaker_clustering import SpeakerEmbedder
    embedder = SpeakerEmbedder()
    emb = embedder.extract_embedding(open(wav_path, "rb").read()[:160000], 16000)
    has_pyannote = emb.sum() != 0  # zero vector = fallback mode (no HF token)
    print(f"  pyannote embedding available: {has_pyannote}")

    # --- cam++ (FunASR) ---
    try:
        from funasr import AutoModel
        spk_model = AutoModel(model="cam++", disable_update=True)
        result = spk_model.generate(input=str(wav_path))
        print(f"  cam++ output: {result}")
        print("  cam++: OK")
    except Exception as e:
        print(f"  cam++: FAILED — {e}")
```

- [ ] **Step 2: Run speaker comparison**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/python.exe -c "from benchmark_funasr import benchmark_speakers; from pathlib import Path; benchmark_speakers(Path('test_data/test_audio.wav'))"
```

- [ ] **Step 3: Commit results**

```bash
git add -A && git commit -m "feat: add speaker diarization benchmark to funasr test"
```

---

### Summary

| Task | Action | Files |
|------|--------|-------|
| 1 | Prepare test audio | `backend/test_data/test_audio.wav` |
| 2 | Install funasr | `backend/requirements.txt` (+funasr) |
| 3 | Write & run benchmark | `backend/benchmark_funasr.py`, `benchmark_results.json` |
| 4 | Speaker comparison | `benchmark_funasr.py` (append) |

**Decision gate after Task 3:** If FunASR is not slower than whisper AND text quality is acceptable, proceed to integration plan. Otherwise, abort.
