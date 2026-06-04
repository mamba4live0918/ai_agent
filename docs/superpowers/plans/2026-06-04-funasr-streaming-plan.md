# FunASR 流式 + 校准双模型实时 ASR 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `realtime_asr.py` 从非流式 paraformer-zh 升级为 paraformer-zh-streaming（GPU）+ FunASR-Nano（CPU 校准）双模型架构，实现直播字幕级实时转写 + 句尾高精度校准。

**Architecture:** 新增 `StreamingASRProcessor`（流式 chunk 推理）、`NanoCalibrator`（句尾 CPU 校准）、改造 `StreamingTranscriber`（能量门控 + VAD 段边界 + 异步校准队列）。GPU 跑 streaming，CPU 跑 Nano，互不阻塞。前端新增 `segment_id`/`is_partial`/`calibrated` 字段处理，三种视觉状态（流式中灰色斜体 / 待校准 ⏳ / 已校准绿色闪烁）。

**Tech Stack:** Python 3.11 + FunASR 1.0+ (paraformer-zh-streaming, Fun-ASR-Nano-2512, fsmn-vad, cam++) + FastAPI WebSocket + React 19 + TypeScript

---

## File Structure

```
backend/app/services/realtime_asr.py   ← 重写：新增 StreamingASRProcessor, NanoCalibrator, EnergyGate; 改造 StreamingTranscriber
backend/app/config.py                  ← +4行：funasr_streaming_model, funasr_calibration_model, funasr_calibration_device, funasr_streaming_device
backend/app/routers/realtime.py        ← 改造：适配 segment_id/is_partial/calibrated, 校准异步回调
backend/app/services/realtime_service.py ← 小改：archive_session 标记 asr_model

frontend/src/hooks/useRealtimeASR.ts   ← 改造：TranscriptSegment 加字段, partial upsert, 校准替换
frontend/src/pages/RealTimeVoice.tsx   ← 改造：三种视觉状态, 校准闪烁动画
frontend/src/components/ChatBubble.tsx ← 改造：新增 isPartial / calibrated 样式
```

---

### Task 1: Config — 新增模型配置项

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: 添加配置字段**

在 `Settings` 类末尾（`use_funasr: bool = True` 之后）添加：

```python
    # ── FunASR streaming + calibration models ──
    funasr_streaming_model: str = "paraformer-zh-streaming"   # 流式 ASR 模型 (GPU)
    funasr_streaming_device: str = "cuda"                       # GPU 推理
    funasr_calibration_model: str = "FunAudioLLM/Fun-ASR-Nano-2512"  # 校准模型 (CPU)
    funasr_calibration_device: str = "cpu"                      # CPU 推理, 不抢 GPU
```

- [ ] **Step 2: 验证**

```bash
cd backend && python -c "from app.config import settings; print(settings.funasr_calibration_model)"
```

Expected: `FunAudioLLM/Fun-ASR-Nano-2512`

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat: add FunASR streaming + calibration model config fields"
```

---

### Task 2: StreamingASRProcessor — 流式 chunk 推理

**Files:**
- Modify: `backend/app/services/realtime_asr.py`

- [ ] **Step 1: 替换 model singletons**

将文件顶部 L87-L104 的全局 singleton 替换为：

```python
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
```

- [ ] **Step 2: 删除旧的 ASRProcessor 类（L278-L352）**

替换为 `StreamingASRProcessor`：

```python
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
```

- [ ] **Step 3: 保留 _bytes_to_wav_bytes 和 _collapse_cjk_spaces helper**

这两个 helper（L61-L82）保留不变，NanoCalibrator 也需要用到。

- [ ] **Step 4: 验证语法**

```bash
cd backend && python -c "from app.services.realtime_asr import StreamingASRProcessor; print('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/realtime_asr.py
git commit -m "feat: replace ASRProcessor with StreamingASRProcessor (paraformer-zh-streaming)"
```

---

### Task 3: NanoCalibrator — 句尾 CPU 校准

**Files:**
- Modify: `backend/app/services/realtime_asr.py` (接续 Task 2)

- [ ] **Step 1: 在 StreamingASRProcessor 之后添加 NanoCalibrator**

```python
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

        try:
            wav_bytes = _bytes_to_wav_bytes(audio_bytes, self._sample_rate)
            kwargs = {"input": wav_bytes}
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
```

- [ ] **Step 2: 验证语法**

```bash
cd backend && python -c "from app.services.realtime_asr import NanoCalibrator; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/realtime_asr.py
git commit -m "feat: add NanoCalibrator for post-segment calibration (FunASR-Nano CPU)"
```

---

### Task 4: StreamingTranscriber — VAD 状态机 + 能量门控 + 异步校准

**Files:**
- Modify: `backend/app/services/realtime_asr.py` (接续 Task 3)

- [ ] **Step 1: 在 ASRSegment dataclass 中添加新字段**

找到 L44-L53 的 `ASRSegment`，修改为：

```python
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
```

- [ ] **Step 2: 重写 StreamingTranscriber（替换 L408-L541）**

```python
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
          │        │  (audio also accumulated into VAD buffer)
          │        ▼
          │   VADProcessor ──► detects segment end
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

        # 2. Feed VAD for segment boundary detection
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
```

- [ ] **Step 3: 删除旧的 _pyannote_check 和 _load_pyannote_vad 函数**

删除 L356-L400（pyannote 相关的两个函数），保留 `_bytes_to_wav_bytes` 和 `_collapse_cjk_spaces`。

- [ ] **Step 4: 验证语法**

```bash
cd backend && python -c "from app.services.realtime_asr import StreamingTranscriber; print('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/realtime_asr.py
git commit -m "feat: rewrite StreamingTranscriber with energy gate + streaming ASR + async Nano calibration"
```

---

### Task 5: WebSocket — 适配新协议字段

**Files:**
- Modify: `backend/app/routers/realtime.py`

- [ ] **Step 1: 更新 WebSocket handler 中的 transcriber 初始化和 segment 处理**

找到 L121-L127 的 `StreamingTranscriber` 初始化，修改参数：

```python
    # ---- Step 3: create the transcription pipeline -------------------------
    transcriber = StreamingTranscriber(
        sample_rate=16000,
        min_speech_duration_ms=400,
        max_speech_duration_s=8.0,
        enable_speaker_clustering=True,
    )
```

- [ ] **Step 2: 修改 segment 推送逻辑（L192-L217）**

将当前的 segment 处理改为：

```python
            for seg in segments:
                speaker_name = transcriber.get_speaker_names().get(
                    seg.speaker, seg.speaker
                )
                seg_dict = {
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text,
                    "speaker": seg.speaker,
                    "speaker_name": speaker_name,
                    "confidence": seg.confidence,
                    "segment_id": seg.segment_id,
                    "is_partial": seg.is_partial,
                    "calibrated": seg.calibrated,
                }
                accumulated_segments.append(seg_dict)
                if seg.speaker:
                    speaker_ids.add(seg.speaker)

                logger.info(
                    "Emitting transcript: %.1fs-%.1fs speaker=%s (%s) partial=%s calib=%s text=%s",
                    seg.start, seg.end, seg.speaker, speaker_name,
                    seg.is_partial, seg.calibrated, seg.text[:80],
                )
                await websocket.send_json({
                    "type": "transcript",
                    **seg_dict,
                    "session_id": session_id,
                })

                # --- Coach trigger evaluation ---
                # Only evaluate on non-partial segments to avoid false triggers
                if not seg.is_partial:
                    recent_texts.append(seg.text)
                    if len(recent_texts) > 10:
                        recent_texts = recent_texts[-10:]

                    speaker_count = len(speaker_ids)
                    triggers = rule_engine.evaluate(
                        text=seg.text,
                        speaker_id=seg.speaker,
                        speaker_count=speaker_count,
                    )

                    for trigger in triggers:
                        try:
                            coach_content = await coach_builder.generate_coach_tip(
                                trigger=trigger,
                                recent_transcript=[{"speaker": seg.speaker, "text": seg.text}],
                                customer_profile=customer_profile,
                                stream=False,
                            )
                            if coach_content:
                                await websocket.send_json({
                                    "type": "coach_tip",
                                    "trigger": trigger.rule_id,
                                    "action": trigger.action,
                                    "content": coach_content,
                                    "session_id": session_id,
                                })
                                accumulated_coach_events.append({
                                    "trigger_rule": trigger.rule_id,
                                    "coach_content": coach_content,
                                    "segment_id": None,
                                })
                                logger.info("Coach tip sent: trigger=%s action=%s", trigger.rule_id, trigger.action)
                        except Exception:
                            logger.exception("Coach prompt generation failed for trigger=%s", trigger.rule_id)
```

- [ ] **Step 3: 修改 flush 段的处理（L264-L286）**

将 flush 的 segment 也加上 `segment_id`/`is_partial`/`calibrated`：

```python
            for seg in final_segments:
                speaker_name = transcriber.get_speaker_names().get(
                    seg.speaker, seg.speaker
                )
                seg_dict = {
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text,
                    "speaker": seg.speaker,
                    "speaker_name": speaker_name,
                    "confidence": seg.confidence,
                    "segment_id": seg.segment_id,
                    "is_partial": seg.is_partial,
                    "calibrated": seg.calibrated,
                }
                accumulated_segments.append(seg_dict)
                if seg.speaker:
                    speaker_ids.add(seg.speaker)
                await websocket.send_json({
                    "type": "transcript",
                    **seg_dict,
                    "session_id": session_id,
                })
```

- [ ] **Step 4: 验证语法**

```bash
cd backend && python -c "from app.routers.realtime import router; print('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/realtime.py
git commit -m "feat: adapt WebSocket to streaming protocol (segment_id/is_partial/calibrated)"
```

---

### Task 6: archive_service — 标记校准模型

**Files:**
- Modify: `backend/app/services/realtime_service.py`

- [ ] **Step 1: 在 RealtimeSegment 创建时添加 asr_model**

修改 L59-L68 的 segment 创建循环：

```python
    for seg in segments:
        asr_model = "funasr-paraformer-zh-streaming"
        if seg.get("calibrated"):
            asr_model = "funasr-nano-calibrated"
        db.add(
            RealtimeSegment(
                session_id=session.id,
                start=seg.get("start", 0.0),
                end=seg.get("end", 0.0),
                text=seg.get("text", ""),
                speaker=seg.get("speaker", ""),
                confidence=seg.get("confidence", 0.0),
                asr_model=asr_model,
            )
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/realtime_service.py
git commit -m "feat: tag segments with calibration model in archive"
```

---

### Task 7: 前端 — TranscriptSegment 类型 + useRealtimeASR 去重逻辑

**Files:**
- Modify: `frontend/src/hooks/useRealtimeASR.ts`

- [ ] **Step 1: 更新 TranscriptSegment 接口（L3-L11）**

```typescript
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
  isPartial: boolean;
  speaker: string;
  speaker_name: string;
  segment_id: string;      // unique per VAD segment, used for upsert
  calibrated: boolean;     // true = Nano calibration applied
}
```

- [ ] **Step 2: 更新 state 类型，移除 partialText**

L66-L67 — 移除 `partialText` state（不再需要单独的 partialText，改为 segment 列表管理）：

```typescript
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [coachTip, setCoachTip] = useState<CoachTip | null>(null);
```

同时从 `UseRealtimeASRState` 接口（L21-L33）和 return 中去掉 `partialText`。

- [ ] **Step 3: 重写 ws.onmessage 中的 transcript 处理（L134-L151）**

```typescript
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === 'transcript') {
            const seg: TranscriptSegment = {
              start: data.start ?? 0,
              end: data.end ?? 0,
              text: data.text ?? '',
              confidence: data.confidence ?? 0,
              isPartial: data.is_partial ?? false,
              speaker: data.speaker ?? '',
              speaker_name: data.speaker_name ?? data.speaker ?? '',
              segment_id: data.segment_id ?? '',
              calibrated: data.calibrated ?? false,
            };

            setTranscript((prev) => {
              // Upsert by segment_id: replace if exists, append if new
              const idx = prev.findIndex(
                (s) => s.segment_id && s.segment_id === seg.segment_id
              );
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = seg;
                return updated;
              }
              return [...prev, seg];
            });
          } else if (data.type === 'coach_tip') {
```

- [ ] **Step 4: 清理 stop/start 中的 partialText 引用**

L116 和 L204: 删除 `setPartialText('')` 两处。

- [ ] **Step 5: 验证 TypeScript**

```bash
cd frontend && npx tsc --noEmit src/hooks/useRealtimeASR.ts
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useRealtimeASR.ts
git commit -m "feat: update useRealtimeASR with segment_id upsert and calibrated field"
```

---

### Task 8: 前端 — ChatBubble 三种视觉状态

**Files:**
- Modify: `frontend/src/components/ChatBubble.tsx`

- [ ] **Step 1: 更新 ChatBubbleProps + 渲染逻辑**

```typescript
export interface ChatBubbleProps {
  text: string;
  timestamp: number;
  speaker: string;
  isSelf: boolean;
  confidence?: number;
  isPartial?: boolean;    // streaming partial → gray italic + pulse
  calibrated?: boolean;   // Nano calibrated → green flash
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ChatBubble({
  text, timestamp, speaker, isSelf, confidence, isPartial, calibrated,
}: ChatBubbleProps) {
  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {/* Speaker label */}
        <span className={`text-[10px] font-medium px-1 ${
          isSelf ? 'text-[var(--accent-blue)] self-end' : 'text-[var(--accent-green)] self-start'
        } flex items-center gap-1`}>
          {speaker}
          {isPartial && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
          )}
          {!isPartial && !calibrated && (
            <span className="text-[10px]" title="待校准">⏳</span>
          )}
          {confidence != null && confidence < 0.7 && (
            <span className="ml-1 text-[var(--text-placeholder)]" title="低置信度">~</span>
          )}
        </span>

        {/* Bubble body */}
        <div className={`
          rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
          ${isPartial
            ? 'text-gray-400 italic bg-[var(--bg-primary)] border border-dashed border-cyan-400/30'
            : isSelf
              ? 'bg-[var(--btn-blue)] text-white rounded-br-md'
              : 'bg-[var(--bg-primary)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border-subtle)]'
          }
          ${calibrated && !isPartial
            ? 'animate-[calibrateFlash_500ms_ease-out]'
            : ''
          }
          transition-colors duration-300
        `}>
          {text}
        </div>

        {/* Timestamp */}
        <span className={`text-[10px] text-[var(--text-placeholder)] px-1 ${isSelf ? 'self-end' : 'self-start'}`}>
          {formatTime(timestamp)}
          {calibrated && (
            <span className="ml-1 text-[var(--accent-green)]" title="已校准">✓</span>
          )}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在全局 CSS 中添加校准闪烁动画**

查找 Tailwind 配置或全局 CSS 文件：

```bash
grep -r "tailwind.config" frontend/ --include="*.ts" --include="*.js" --include="*.mjs" -l
```

在 `tailwind.config` 的 `extend.animation` 中添加（如果是 v4 或 CSS-only，则在全局 CSS 中添加）：

```css
@keyframes calibrateFlash {
  0% { background-color: rgba(34, 197, 94, 0.15); }
  100% { background-color: transparent; }
}
```

如果是 Tailwind v4，在 `frontend/src/index.css` 末尾添加：

```css
@keyframes calibrateFlash {
  0% { background-color: rgba(34, 197, 94, 0.15); }
  100% { background-color: transparent; }
}
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatBubble.tsx frontend/src/index.css
git commit -m "feat: add ChatBubble partial/calibrated visual states with pulse and flash"
```

---

### Task 9: 前端 — RealTimeVoice 页面适配新 segment 格式

**Files:**
- Modify: `frontend/src/pages/RealTimeVoice.tsx`

- [ ] **Step 1: 更新 ChatBubble 调用（L280-L288）**

````typescript
          {displaySegments.map((seg, i) => {
            const { label, isSelf } = getSpeakerInfo(seg);
            return (
              <ChatBubble
                key={`seg-${seg.segment_id || i}`}
                text={seg.text}
                timestamp={seg.start}
                speaker={label}
                isSelf={isSelf}
                confidence={seg.confidence}
                isPartial={seg.isPartial}
                calibrated={seg.calibrated}
              />
            );
          })}
````

- [ ] **Step 2: 移除 useRealtimeASR 解构中的 partialText**

L46-L54: 去掉 `partialText`（如果 hook 还有的话，已在 Task 7 移除）。

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RealTimeVoice.tsx
git commit -m "feat: pass isPartial/calibrated to ChatBubble in RealTimeVoice"
```

---

### Task 10: 集成测试 — 端到端流式 + 校准验证

**Files:**
- No new files. Manual verification steps.

- [ ] **Step 1: 启动后端，验证模型加载**

```bash
cd backend && python -c "
from app.services.realtime_asr import StreamingTranscriber
tc = StreamingTranscriber(sample_rate=16000, enable_speaker_clustering=False)
print(f'StreamingASR: OK')
print(f'NanoCalibrator available: {tc._calibrator.available}')
print(f'Energy gate threshold: {tc._energy_threshold}')
"
```

Expected: `StreamingASR: OK`, `NanoCalibrator available: True/False`（取决于硬件）

- [ ] **Step 2: 模拟音频流测试**

```bash
cd backend && python -c "
import wave, time
from app.services.realtime_asr import StreamingTranscriber

# Load a short test WAV file (16kHz mono PCM)
# or generate synthetic audio
import numpy as np
import io

# Generate 2s of 440Hz tone as test audio
sr = 16000
dur = 2.0
t = np.linspace(0, dur, int(sr * dur), endpoint=False)
samples = (np.sin(2 * np.pi * 440 * t) * 0.3 * 32767).astype(np.int16)

tc = StreamingTranscriber(sample_rate=sr, enable_speaker_clustering=False)

# Simulate 100ms chunks
chunk_size = int(0.1 * sr)  # 1600 samples
chunk_bytes = chunk_size * 2  # 3200 bytes (16-bit)
total_samples = len(samples)
results = []

for i in range(0, total_samples, chunk_size):
    chunk = samples[i:i + chunk_size].tobytes()
    segs = tc.feed_chunk(chunk)
    for seg in segs:
        print(f'  [{seg.segment_id}] is_partial={seg.is_partial} calib={seg.calibrated} text={seg.text[:60]}')
    results.extend(segs)

# Flush
final = tc.flush()
for seg in final:
    print(f'  FLUSH [{seg.segment_id}] is_partial={seg.is_partial} calib={seg.calibrated} text={seg.text[:60]}')
results.extend(final)

print(f'Total segments: {len(results)}')
print(f'Partial segments: {sum(1 for s in results if s.is_partial)}')
print(f'Final segments: {sum(1 for s in results if not s.is_partial and not s.calibrated)}')
print(f'Calibrated segments: {sum(1 for s in results if s.calibrated)}')
tc.reset()
"
```

- [ ] **Step 3: 降级测试 — 验证 Nano 不可用时不崩溃**

```bash
cd backend && python -c "
from app.services.realtime_asr import NanoCalibrator
# 即使未加载模型，calibrate() 也应安全返回空字符串
nc = NanoCalibrator(sample_rate=16000)
text, conf = nc.calibrate(b'\\x00' * 32000)
assert text == '', f'Expected empty string, got: {text}'
assert conf == 0.0
print('Fallback test: PASS')
"
```

- [ ] **Step 4: 完整启动系统手动测试**

```bash
# Terminal 1: Backend
cd backend && uvicorn app.main:app --port 8000 --reload

# Terminal 2: Frontend
cd frontend && npm run dev
```

打开浏览器 → 访问实时语音陪跑页面 → 点击"开始录音" → 说话 → 观察：

1. **partial 字幕**：灰色斜体 + 青色脉冲点，逐字出现
2. **final 字幕**：说话停顿后变成正式样式 + ⏳ 图标
3. **校准字幕**：片刻后绿色闪烁 + ✓ 标记

- [ ] **Step 5: 检查日志无异常**

```bash
# 查看后端日志，确认：
# - "FunASR-Nano loaded" 或 "Failed to load FunASR-Nano, calibration disabled"
# - "Calibration submitted for seg_XXXX"
# - "Calibration complete for seg_XXXX"
# - 无 Python traceback
tail -f backend/server_out.txt
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: verify streaming + calibration pipeline end-to-end"
```

---

## Complete Task Checklist

- [ ] Task 1: Config fields (4 model settings)
- [ ] Task 2: StreamingASRProcessor (chunk inference + cache)
- [ ] Task 3: NanoCalibrator (CPU calibration + fallback)
- [ ] Task 4: StreamingTranscriber (energy gate + VAD + calibration queue)
- [ ] Task 5: WebSocket router (segment_id / is_partial / calibrated)
- [ ] Task 6: archive_service (tag calibration model)
- [ ] Task 7: useRealtimeASR (segment_id upsert)
- [ ] Task 8: ChatBubble (3 visual states)
- [ ] Task 9: RealTimeVoice (pass new props)
- [ ] Task 10: Integration test (verify end-to-end)
