# FunASR Full Integration — Replace entire ASR stack

**Date:** 2026-06-03
**Status:** Approved
**Scope:** Backend — replace faster-whisper + pyannote + Silero-VAD with FunASR

## Motivation

Benchmark proven: Paraformer-zh (220M) is **12.4x faster** than faster-whisper large-v3-turbo (809M) on Chinese speech, with better accuracy and automatic punctuation. Replacing the entire fragmented ASR stack with FunASR's unified toolkit reduces dependencies from 4 libraries to 1, cuts model size by 75%, and improves both speed and quality.

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Post-sales approach | FunASR native pipeline (AutoModel one-shot) | Matches benchmark exactly — RTF 0.047 |
| Realtime approach | Keep streaming architecture, swap all models | WebSocket incremental audio requires per-chunk processing |
| Speaker model | cam++ (7.2M) | Smaller and faster than pyannote embedding (512-dim) |
| OpenCC | **Remove** | Paraformer outputs simplified Chinese natively |

## Architecture

### Before

```
                ┌──────────────────────────────────┐
                │        StreamingTranscriber       │
                │  ┌────────┐ ┌──────────┐ ┌─────┐ │
  audio_bytes ─►│  │Silero  │→│faster-   │→│pyann│→│  ASRSegment[]
                │  │VAD     │ │whisper   │ │ote  │ │
                │  └────────┘ └──────────┘ └─────┘ │
                └──────────────────────────────────┘
                
  transcribe_audio: ffmpeg → faster-whisper → pyannote → segments
```

### After

```
                ┌──────────────────────────────────┐
                │        StreamingTranscriber       │
                │  ┌────────┐ ┌──────────┐ ┌─────┐ │
  audio_bytes ─►│  │fsmn-vad│→│paraformer│→│cam++│→│  ASRSegment[]
                │  │(FunASR)│ │-zh       │ │     │ │
                │  └────────┘ └──────────┘ └─────┘ │
                └──────────────────────────────────┘
                
  transcribe_audio: ffmpeg → AutoModel(paraformer+vad+punc+spk) → segments
```

## Component Changes

### 1. Post-Sales Transcription (`post_sales_service.py`)

**Current (~40 lines):**
```python
from faster_whisper import WhisperModel
model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
segments, _ = model.transcribe(wav_path, beam_size=5)
# + pyannote diarization
# + OpenCC conversion
```

**After (~10 lines):**
```python
from funasr import AutoModel
model = AutoModel(
    model="paraformer-zh",
    vad_model="fsmn-vad",
    punc_model="ct-punc",
    spk_model="cam++",
)
result = model.generate(input=wav_path)
segments = _parse_funasr_result(result)  # → [{"start","end","text","speaker"}]
```

- No ffmpeg conversion needed (FunASR handles resampling internally)
- No OpenCC needed (Paraformer outputs simplified Chinese)
- No separate pyannote call (cam++ built into pipeline)
- Single model instance, reused across calls

### 2. Real-Time Streaming (`realtime_asr.py`)

**VAD replacement:**
- Remove: `SileroVADIterator` class (~80 lines)
- Add: `FunASRVAD` wrapper — calls `fsmn-vad` AutoModel on PCM chunks
- Interface preserved: returns VAD segments with `{start, end}` timestamps

**ASR replacement:**
- Remove: `ASRProcessor` class (~80 lines, WhisperModel wrapper)
- Add: `FunASRASR` wrapper — calls `paraformer-zh` AutoModel per VAD segment
- Interface preserved: `transcribe(audio_bytes) → str`
- RTF improves from 0.58 → 0.047 per segment

**Speaker clustering replacement:**
- Remove: `SpeakerEmbedder` class (~120 lines, pyannote embedding + LRU cache)
- Modify: `OnlineSpeakerClustering` — use cam++ embedding instead of pyannote
- Interface preserved: `add_segment(audio_bytes, sample_rate) → speaker_id`
- cam++ embedding dimension may differ from pyannote's 512 — adjust clustering threshold accordingly

### 3. Files Changed

| File | Action | Description |
|------|--------|-------------|
| `services/realtime_asr.py` | **Rewrite** | VAD + ASR classes replaced with FunASR wrappers |
| `services/speaker_clustering.py` | **Modify** | SpeakerEmbedder → cam++; keep OnlineSpeakerClustering |
| `services/post_sales_service.py` | **Simplify** | transcribe_audio() → 10-line FunASR pipeline |
| `routers/realtime.py` | **No change** | WebSocket endpoint unchanged |
| `requirements.txt` | **Modify** | +funasr, -faster-whisper, -pyannote.audio (keep silero-vad as fallback) |

### 4. Interface Contract (unchanged)

**StreamingTranscriber:**
```python
tc = StreamingTranscriber(sample_rate=16000, enable_speaker_clustering=True)
segments: list[ASRSegment] = tc.feed_chunk(audio_bytes)
# ASRSegment: {start: float, end: float, text: str, speaker: str, confidence: float}
tc.reset()
tc.total_seconds  # float
tc.get_speaker_names()  # dict[str, str]
```

**transcribe_audio:**
```python
segments: list[dict] = transcribe_audio(file_path)
# dict: {"start": float, "end": float, "text": str, "speaker": str}
```

### 5. Model Loading Strategy

**Lazy loading + singleton pattern:**
- Post-sales: load `AutoModel` once at module level, keep in memory
- Realtime: create per-session VAD/ASR/spk instances (lightweight)
- All models cached by FunASR on first use (~2s warm-up, then instant)

### 6. Rollback Plan

- Keep `faster-whisper` and `pyannote` in `requirements.txt` as optional deps initially
- Feature flag: `USE_FUNASR=true` env var to switch between old and new pipelines
- Remove old deps after 1 week stable runtime

## Non-Goals

- Frontend changes
- WebSocket protocol changes
- Training/SalesSession changes
- Database schema changes
