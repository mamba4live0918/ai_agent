# FunASR Full Replacement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace faster-whisper + pyannote + Silero-VAD with FunASR (paraformer-zh + fsmn-vad + cam++ + ct-punc) across both realtime and post-sales pipelines.

**Architecture:** Post-sales uses FunASR AutoModel one-shot. Realtime preserves the VAD→ASR→Speaker streaming pipeline but swaps all models to FunASR equivalents. All external interfaces unchanged.

**Tech Stack:** Python 3.11, funasr 1.3.9, torch, FastAPI WebSocket

---

### Task 1: Replace post_sales transcribe_audio() with FunASR

**Files:**
- Modify: `backend/app/services/post_sales_service.py`
- Remove: OpenCC import, faster-whisper import, pyannote diarization helpers

- [ ] **Step 1: Rewrite transcribe_audio()**

Replace lines ~87-126 with the following:

```python
# ── FunASR transcription pipeline (lazy-initialized singleton) ──

_funasr_model = None

def _get_funasr_model():
    """Return a cached FunASR AutoModel with paraformer + VAD + punctuation + speaker."""
    global _funasr_model
    if _funasr_model is None:
        from funasr import AutoModel
        _funasr_model = AutoModel(
            model="paraformer-zh",
            vad_model="fsmn-vad",
            punc_model="ct-punc",
            spk_model="cam++",
            disable_update=True,
        )
    return _funasr_model


def transcribe_audio(file_path: str) -> list[dict]:
    """Transcribe audio with FunASR paraformer-zh + VAD + punctuation + speaker diarization.

    Returns list of segments: [{"start": float, "end": float, "text": str, "speaker": str}]
    """
    if not shutil.which("ffmpeg"):
        raise ServiceError("ffmpeg not found — install ffmpeg to enable audio transcription")

    if not os.path.exists(file_path):
        raise ServiceError(f"Audio file not found: {file_path}")

    try:
        model = _get_funasr_model()
        result = model.generate(input=file_path)
    except Exception as e:
        raise ServiceError(f"FunASR transcription failed: {e}")

    # Parse FunASR output into standard segment format
    if isinstance(result, list) and len(result) > 0:
        r = result[0]
    elif isinstance(result, dict):
        r = result
    else:
        return [{"start": 0, "end": 0, "text": str(result), "speaker": "未知"}]

    segments = []
    sentences = r.get("sentences", []) or []
    if sentences:
        for sent in sentences:
            segments.append({
                "start": sent.get("start", 0) / 1000.0,  # FunASR uses ms
                "end": sent.get("end", 0) / 1000.0,
                "text": sent.get("text", "").strip(),
                "speaker": sent.get("spk", "未知"),
            })
    else:
        # No sentence-level output — use full text
        text = r.get("text", "")
        if isinstance(text, list):
            text = " ".join(text)
        segments = [{"start": 0, "end": 0, "text": text.strip(), "speaker": "未知"}]

    return segments
```

- [ ] **Step 2: Remove old imports and helpers**

Remove these imports near the top of the file:
```python
# REMOVE:
from opencc import OpenCC
# (keep shutil, os, subprocess for ffmpeg if still needed elsewhere)

# The _cc singleton — REMOVE if only used in old transcribe_audio:
_cc = OpenCC("t2s")
```

Remove the `_run_diarization()` and `_align_speakers()` functions if they are only called from the old `transcribe_audio()`.

- [ ] **Step 3: Verify import and test**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/python.exe -c "
from app.services.post_sales_service import transcribe_audio
segs = transcribe_audio('test_data/sales_dialogue_16k.wav')
print(f'Segments: {len(segs)}')
for s in segs[:3]:
    print(f'  [{s[\"speaker\"]}] {s[\"start\"]:.1f}s: {s[\"text\"][:80]}')
"
```

Expected: 5-10 segments with speaker labels and text from the dialogue.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/post_sales_service.py
git commit -m "refactor(post_sales): replace whisper+pyannote with FunASR one-shot pipeline"
```

---

### Task 2: Replace realtime ASR — VAD + ASR processors

**Files:**
- Modify: `backend/app/services/realtime_asr.py`
- Remove: Silero-VAD class, faster-whisper ASRProcessor class, OpenCC import
- Add: FunASR VAD wrapper, FunASR ASR wrapper

- [ ] **Step 1: Rewrite VAD processor**

Replace the `VADProcessor` class (~lines 40-280) with a FunASR fsmn-vad wrapper:

```python
# ── FunASR VAD wrapper (fsmn-vad) ──

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
    speech segments are detected.
    """

    def __init__(self, sample_rate: int = 16000):
        self._sample_rate = sample_rate
        self._buffer = bytearray()
        self._offset_samples = 0
        self._current_sample = 0

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    def feed(self, audio_bytes: bytes) -> list[VADSegment]:
        """Feed a chunk of raw PCM audio, return completed VAD segments."""
        self._buffer.extend(audio_bytes)

        # fsmn-vad expects file path or numpy array; accumulate ~1s before processing
        if len(self._buffer) < self._sample_rate * 2:  # < 1 second
            return []

        import numpy as np
        import io
        import wave
        import tempfile
        import os

        # Write buffer to temp WAV for fsmn-vad
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            with wave.open(tmp, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(self._sample_rate)
                wf.writeframes(bytes(self._buffer))
            tmp_path = tmp.name

        try:
            model = _get_funasr_vad()
            result = model.generate(input=tmp_path)
        finally:
            os.unlink(tmp_path)

        self._buffer = bytearray()

        segments = []
        if result and isinstance(result, list) and len(result) > 0:
            r = result[0]
            vad_segments = r.get("value", []) or []
            for seg in vad_segments:
                start_sec = seg[0] / 1000.0 if isinstance(seg, list) else seg.get("start", 0) / 1000.0
                end_sec = seg[1] / 1000.0 if isinstance(seg, list) else seg.get("end", 0) / 1000.0
                samp_start = int(start_sec * self._sample_rate) + self._offset_samples
                samp_end = int(end_sec * self._sample_rate) + self._offset_samples
                audio_data = bytes(self._buffer[max(0, samp_start - self._offset_samples):max(0, samp_end - self._offset_samples)])
                segments.append(VADSegment(
                    start=start_sec,
                    end=end_sec,
                    audio_bytes=audio_data,
                ))

        self._offset_samples += len(self._buffer) // 2
        self._current_sample = self._offset_samples
        return segments

    def reset(self) -> None:
        self._buffer = bytearray()
        self._offset_samples = 0
        self._current_sample = 0
```

- [ ] **Step 2: Rewrite ASR processor**

Replace the `ASRProcessor` class (~lines 400-500) with a FunASR paraformer-zh wrapper:

```python
# ── FunASR ASR wrapper (paraformer-zh) ──

_funasr_asr = None

def _get_funasr_asr():
    global _funasr_asr
    if _funasr_asr is None:
        from funasr import AutoModel
        _funasr_asr = AutoModel(
            model="paraformer-zh",
            disable_update=True,
        )
    return _funasr_asr


class ASRProcessor:
    """Transcribes audio segments using FunASR paraformer-zh (220M, non-autoregressive).

    Much faster than faster-whisper (RTF 0.047 vs 0.58 on CPU).
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

        # Write audio bytes to temp WAV
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            with wave.open(tmp, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(self._sample_rate)
                wf.writeframes(audio_bytes)
            tmp_path = tmp.name

        try:
            model = _get_funasr_asr()
            result = model.generate(input=tmp_path)
        finally:
            os.unlink(tmp_path)

        if result and isinstance(result, list) and len(result) > 0:
            r = result[0]
            text = r.get("text", "")
            if isinstance(text, list):
                text = " ".join(text)
            return text.strip()
        return ""
```

- [ ] **Step 3: Remove OpenCC**

Remove the `_cc` singleton at the top of the file:
```python
# REMOVE:
from opencc import OpenCC
_cc = OpenCC("t2s")
```

Remove any `_cc.convert()` calls in the `StreamingTranscriber.feed_chunk()` method.

- [ ] **Step 4: Remove temp file writes in StreamingTranscriber**

In the existing `StreamingTranscriber.feed_chunk()` method, VAD segments already carry `audio_bytes`. The ASR processor transcribes directly from bytes. Remove any WAV file write/read logic related to VAD audio export.

- [ ] **Step 5: Verify the module imports**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/python.exe -c "
from app.services.realtime_asr import StreamingTranscriber, VADProcessor, ASRProcessor, VADSegment, ASRSegment
print('All classes imported OK')
"
```

Expected: `All classes imported OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/realtime_asr.py
git commit -m "refactor(realtime): replace Silero-VAD+faster-whisper with FunASR fsmn-vad+paraformer-zh"
```

---

### Task 3: Replace speaker clustering — pyannote → cam++

**Files:**
- Modify: `backend/app/services/speaker_clustering.py`

- [ ] **Step 1: Rewrite SpeakerEmbedder to use cam++**

Replace the `SpeakerEmbedder` class with a cam++ wrapper:

```python
# ── FunASR cam++ speaker embedder ──

_campp_model = None

def _get_campp():
    global _campp_model
    if _campp_model is None:
        from funasr import AutoModel
        _campp_model = AutoModel(model="cam++", disable_update=True)
    return _campp_model


class SpeakerEmbedder:
    """Extract speaker embeddings using FunASR cam++ model (7.2M params).

    Falls back to random embedding when the model cannot be loaded,
    so the pipeline never crashes.
    """

    EMBEDDING_DIM = 192  # cam++ output dimension

    def __init__(self):
        self._model = None
        self._model_available = False
        self._load_attempted = False
        self._cache: dict[int, np.ndarray] = {}

    def _ensure_model(self) -> bool:
        if self._load_attempted:
            return self._model_available
        self._load_attempted = True

        try:
            self._model = _get_campp()
            self._model_available = True
            logger.info("SpeakerEmbedder: cam++ model loaded")
            return True
        except Exception:
            logger.warning(
                "SpeakerEmbedder: failed to load cam++ model. "
                "Speaker embeddings will be random.",
                exc_info=True,
            )
            return False

    def extract_embedding(self, audio_bytes: bytes, sample_rate: int) -> np.ndarray:
        """Return a ``EMBEDDING_DIM``-dim speaker embedding vector."""
        if not audio_bytes or len(audio_bytes) < sample_rate // 10:
            return np.zeros(self.EMBEDDING_DIM, dtype=np.float32)

        key = hash(audio_bytes)
        if key in self._cache:
            return self._cache[key].copy()

        embedding = self._extract_impl(audio_bytes, sample_rate)

        if len(self._cache) >= 200:
            oldest = next(iter(self._cache))
            del self._cache[oldest]
        self._cache[key] = embedding

        return embedding.copy()

    def _extract_impl(self, audio_bytes: bytes, sample_rate: int) -> np.ndarray:
        if not self._ensure_model():
            return self._random_embedding()

        try:
            import tempfile
            import wave
            import os

            # Write to temp WAV for cam++
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                with wave.open(tmp, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(sample_rate)
                    wf.writeframes(audio_bytes)
                tmp_path = tmp.name

            try:
                result = self._model.generate(input=tmp_path)
                # cam++ returns embedding in the result dict
                if isinstance(result, list) and len(result) > 0:
                    r = result[0]
                elif isinstance(result, dict):
                    r = result
                else:
                    return self._random_embedding()

                emb = r.get("embedding", r.get("spk_embedding", None))
                if emb is not None:
                    emb = np.array(emb, dtype=np.float32).flatten()
                else:
                    return self._random_embedding()

                if emb.shape[0] == 0:
                    return self._random_embedding()

                # L2-normalize
                norm = np.linalg.norm(emb)
                if norm > 0:
                    emb = emb / norm
                return emb.astype(np.float32)

            finally:
                os.unlink(tmp_path)

        except Exception as e:
            logger.warning("SpeakerEmbedder: extraction failed", exc_info=True)
            return self._random_embedding()

    def _random_embedding(self) -> np.ndarray:
        emb = np.random.RandomState().randn(self.EMBEDDING_DIM).astype(np.float32)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm
        return emb

    def clear_cache(self) -> None:
        self._cache.clear()
```

- [ ] **Step 2: Adjust OnlineSpeakerClustering default threshold**

cam++ embedding dimension (192) differs from pyannote (512). Adjust the similarity threshold:

```python
# In OnlineSpeakerClustering.__init__, change defaults:
similarity_threshold: float = 0.45,  # was 0.35 for pyannote; cam++ cosine space may differ
```

- [ ] **Step 3: Remove pyannote import**

Remove:
```python
# REMOVE:
from ..config import settings  # was used only for HUGGINGFACE_TOKEN check
# (keep if used elsewhere in the file)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/speaker_clustering.py
git commit -m "refactor(speaker): replace pyannote embedding with FunASR cam++"
```

---

### Task 4: Cleanup requirements + add feature flag

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`

- [ ] **Step 1: Update requirements.txt**

Change these lines in `backend/requirements.txt`:

```diff
- faster-whisper==1.2.0
- pyannote.audio>=3.0
- opencc-python-reimplemented==0.1.7
- silero-vad>=6.0
+ # ASR replaced by FunASR (2026-06)
+ funasr>=1.0
+ # Legacy deps kept for rollback — remove after 1 week stable:
+ # faster-whisper==1.2.0
+ # pyannote.audio>=3.0
```

- [ ] **Step 2: Add USE_FUNASR feature flag**

In `backend/app/config.py`, add to Settings class:

```python
# FunASR feature flag
use_funasr: bool = os.getenv("USE_FUNASR", "true").lower() == "true"
```

- [ ] **Step 3: Add fallback logic in realtime_asr.py and post_sales_service.py**

In both files, wrap the FunASR imports in try/except and provide a fallback path:

```python
# In realtime_asr.py top-level:
if not settings.use_funasr:
    # Legacy path — kept for rollback
    from faster_whisper import WhisperModel
    from opencc import OpenCC
    _cc = OpenCC("t2s")
```

In `StreamingTranscriber.__init__`, branch on `settings.use_funasr`.

- [ ] **Step 4: Verify full build**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/python.exe -c "
from app.services.post_sales_service import transcribe_audio
from app.services.realtime_asr import StreamingTranscriber
print('All imports OK')
"
```

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/app/config.py backend/app/services/realtime_asr.py backend/app/services/post_sales_service.py
git commit -m "chore: add USE_FUNASR flag, comment out legacy deps in requirements"
```

---

### Task 5: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Test post-sales transcription**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/python.exe -c "
from app.services.post_sales_service import transcribe_audio
import time
t0 = time.perf_counter()
segs = transcribe_audio('test_data/sales_dialogue_16k.wav')
t = time.perf_counter() - t0
print(f'Transcribed {len(segs)} segments in {t:.1f}s')
for s in segs:
    print(f'  [{s[\"speaker\"]}] {s[\"start\"]:.1f}s: {s[\"text\"][:100]}')
print(f'RTF: {t/64.5:.3f} (target: <0.05)')
"
```

Expected: ~7 segments, RTF ~0.05, Chinese text with speakers labeled.

- [ ] **Step 2: Test real-time streaming with synthetic audio**

```bash
cd c:/Users/Mamba4live/Desktop/intern/ai_trainer/backend
.venv/Scripts/python.exe -c "
import wave, time
from app.services.realtime_asr import StreamingTranscriber

# Read test audio
with wave.open('test_data/sales_dialogue_16k.wav', 'rb') as wf:
    audio = wf.readframes(wf.getnframes())

tc = StreamingTranscriber(sample_rate=16000, enable_speaker_clustering=True)
t0 = time.perf_counter()
chunk_size = 3200  # 100ms at 16kHz
segments = []
for i in range(0, len(audio), chunk_size):
    chunk = audio[i:i+chunk_size]
    if len(chunk) < chunk_size:
        break
    segs = tc.feed_chunk(chunk)
    segments.extend(segs)

t = time.perf_counter() - t0
tc.reset()
print(f'Streaming: {len(segments)} segments in {t:.1f}s')
for s in segments[:5]:
    print(f'  [{s.speaker}] {s.start:.1f}s: {s.text[:80]}')
print(f'RTF: {t/64.5:.3f}')
"
```

Expected: segments with speaker labels, RTF well below 1.0.

- [ ] **Step 3: Commit verification results**

```bash
git add -A && git commit -m "test: end-to-end FunASR verification passed"
```

---

### Summary

| Task | Files | Key Change |
|------|-------|------------|
| 1 | `post_sales_service.py` | transcribe_audio → FunASR one-shot |
| 2 | `realtime_asr.py` | VADProcessor + ASRProcessor → FunASR wrappers |
| 3 | `speaker_clustering.py` | pyannote embedding → cam++ |
| 4 | `requirements.txt`, `config.py` | Dependency cleanup + feature flag |
| 5 | None | E2E verification |

**Rollback:** Set `USE_FUNASR=false` to revert to legacy pipeline. Legacy deps kept commented in requirements.txt for 1-week grace period.
