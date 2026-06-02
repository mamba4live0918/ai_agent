# FunASR Integration — Benchmark & Evaluation

**Date:** 2026-06-02
**Status:** Approved
**Scope:** Backend — benchmark only, no production code changes

## Motivation

Current ASR pipeline uses three separate libraries (faster-whisper, pyannote, Silero-VAD) totaling ~900M+ parameters. FunASR offers a unified Chinese-optimized toolkit (Paraformer-zh 220M + fsmn-vad + cam++ 7.2M + ct-punc) that could be faster, more accurate for Mandarin, and simpler to maintain.

## Design Decision

**Acceptance criteria: "not worse"** — if FunASR matches or exceeds whisper accuracy AND is not slower, replace. The combination of 3x smaller model + 60k hours Mandarin training data makes it highly likely to pass.

## Benchmark Plan

### Step 1: Environment

```bash
pip install funasr
# Models auto-downloaded by funasr on first use:
# - paraformer-zh (220M)
# - fsmn-vad
# - ct-punc
# - cam++ (7.2M)
```

Verify no dependency conflicts with existing `faster-whisper`, `torch`, `torchaudio`.

### Step 2: Benchmark Script

File: `backend/benchmark_funasr.py`

Two test scenarios:

**A. File transcription (post-sales)**
- Load a test audio file (~30s Chinese speech)
- Run faster-whisper pipeline: ffmpeg → 16kHz WAV → whisper.transcribe()
- Run FunASR pipeline: ffmpeg → 16kHz WAV → AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc")
- Compare: WER/CER (human review), inference time (RTF), model load time, peak memory

**B. Streaming simulation (realtime)**
- Simulate 100ms audio chunks from the same file
- Run current pipeline: VAD + whisper per segment
- Run FunASR: fsmn-vad + paraformer streaming per segment
- Compare: latency per segment, total RTF, segment boundary accuracy

### Step 3: Speaker Diarization

- Run pyannote embedding + cosine clustering on test multi-speaker audio
- Run cam++ on same audio
- Compare: speaker count accuracy, speaker assignment consistency

### Output

Benchmark script prints a comparison table:

```
=== FunASR Benchmark Results ===
Audio duration: 32.5s | Chinese sales conversation | 2 speakers

| Metric              | Whisper+pyannote | FunASR      |
|---------------------|------------------|-------------|
| Transcription time  | 12.3s (RTF 0.38) | 4.1s (RTF 0.13) |
| Model load time     | 2.1s             | 1.4s        |
| Peak memory         | 1.8 GB           | 0.9 GB      |
| Speaker count       | 2                | 2           |
| Speaker accuracy    | ~90%             | ~91%        |
| Punctuation         | none             | auto        |
```

### Decision Gate

| Outcome | Action |
|---------|--------|
| Speed >= whisper AND text quality ok | Proceed to integration plan |
| Speed slower OR text quality clearly worse | Abort, document results |
| Speed better but text quality unclear | Run larger test set, consult user |

## Non-Goals

- No changes to `realtime_asr.py`, `post_sales_service.py`, or any production code
- No frontend changes
- No WebSocket integration
- No TTS
