"""
FunASR vs faster-whisper benchmark.
Compares transcription speed and quality on the same test audio.
"""

import os
import sys
import json
import time
import subprocess
import tracemalloc
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

TEST_AUDIO = Path(__file__).parent / "test_data" / "test_audio.wav"


def _ensure_wav(src: Path) -> Path:
    """Ensure audio is 16kHz mono WAV."""
    if src.suffix == ".wav":
        return src
    dst = src.with_suffix(".wav")
    subprocess.run([
        "ffmpeg", "-y", "-i", str(src),
        "-ar", "16000", "-ac", "1", "-f", "wav", str(dst),
    ], capture_output=True, check=True)
    return dst


def _audio_duration_seconds(wav_path: Path) -> float:
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration", "-of", "default=noprint_wrappers=1:nokey=1",
        str(wav_path),
    ], capture_output=True, text=True)
    if result.returncode == 0 and result.stdout.strip():
        return float(result.stdout.strip())
    return wav_path.stat().st_size / 32000.0


# ── Pipeline 1: faster-whisper ──

def benchmark_whisper(wav_path: Path) -> dict:
    print("=" * 60)
    print("Pipeline 1: faster-whisper large-v3-turbo (INT8 CPU)")
    print("=" * 60)

    from faster_whisper import WhisperModel

    t0 = time.perf_counter()
    model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
    load_time = time.perf_counter() - t0
    print(f"  Model loaded in {load_time:.1f}s")

    t1 = time.perf_counter()
    segments_raw, info = model.transcribe(str(wav_path), beam_size=5)
    seg_list = list(segments_raw)
    transcribe_time = time.perf_counter() - t1

    text = " ".join(s.text.strip() for s in seg_list)
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


# ── Pipeline 2: FunASR ──

def benchmark_funasr(wav_path: Path) -> dict:
    print()
    print("=" * 60)
    print("Pipeline 2: FunASR paraformer-zh + fsmn-vad + ct-punc")
    print("=" * 60)

    from funasr import AutoModel

    t0 = time.perf_counter()
    model = AutoModel(
        model="paraformer-zh",
        vad_model="fsmn-vad",
        punc_model="ct-punc",
        disable_update=True,
    )
    load_time = time.perf_counter() - t0
    print(f"  Model loaded in {load_time:.1f}s")

    t1 = time.perf_counter()
    result = model.generate(input=str(wav_path))
    transcribe_time = time.perf_counter() - t1

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

    sent_count = 0
    if isinstance(r, dict):
        sents = r.get("sentences", r.get("segments", []))
        sent_count = len(sents) if sents else 0

    print(f"  Sentences: {sent_count}")
    print(f"  Transcribe time: {transcribe_time:.1f}s")
    print(f"  Text preview: {text[:120]}...")

    return {
        "model": "FunASR paraformer-zh + fsmn-vad + ct-punc",
        "load_time_s": round(load_time, 1),
        "transcribe_time_s": round(transcribe_time, 1),
        "segments": sent_count if sent_count > 0 else len(text.split()),
        "text": text,
    }


# ── Main ──

def main():
    if not TEST_AUDIO.exists():
        print(f"ERROR: Test audio not found at {TEST_AUDIO}")
        sys.exit(1)

    wav_path = _ensure_wav(TEST_AUDIO)
    duration = _audio_duration_seconds(wav_path)
    print(f"Test audio: {wav_path} ({duration:.1f}s)")
    print()

    tracemalloc.start()

    r1 = benchmark_whisper(wav_path)
    r2 = benchmark_funasr(wav_path)

    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    print()
    print("=" * 70)
    print("RESULTS")
    print("=" * 70)
    print(f"{'Metric':<30} {'faster-whisper':>18} {'FunASR':>18}")
    print("-" * 70)
    print(f"{'Model load time':<30} {r1['load_time_s']:>17.1f}s {r2['load_time_s']:>17.1f}s")
    print(f"{'Transcribe time':<30} {r1['transcribe_time_s']:>17.1f}s {r2['transcribe_time_s']:>17.1f}s")
    rtf1 = r1['transcribe_time_s'] / duration if duration > 0 else 0
    rtf2 = r2['transcribe_time_s'] / duration if duration > 0 else 0
    print(f"{'RTF (time/audio)':<30} {rtf1:>18.3f} {rtf2:>18.3f}")
    speedup = rtf1 / rtf2 if rtf2 > 0 else float('inf')
    print(f"{'Speedup':<30} {'—':>18} {f'{speedup:.1f}x faster':>18}")
    print(f"{'Segments/Sentences':<30} {r1['segments']:>18} {r2['segments']:>18}")
    print(f"{'Peak memory (MB)':<30} {'—':>18} {f'{peak/1024/1024:.0f}':>18}")

    print()
    print("Text comparison:")
    print(f"  Whisper:  {r1['text'][:200]}")
    print(f"  FunASR:   {r2['text'][:200]}")
    print()

    # Decision
    if rtf2 <= rtf1 * 1.1:
        print("VERDICT: FunASR matches or beats whisper speed. Proceed to integration.")
    else:
        print("VERDICT: FunASR slower than whisper. Review before proceeding.")

    # Save results
    results = {
        "audio_duration_s": round(duration, 1),
        "whisper": r1,
        "funasr": r2,
        "peak_memory_mb": round(peak / 1024 / 1024, 1),
    }
    out_path = Path(__file__).parent / "benchmark_results.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
