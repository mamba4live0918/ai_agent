# FunASR 流式 + 校准双模型实时 ASR 方案设计

> **日期**: 2026-06-04
> **分支**: feat/funasr-integration
> **当前状态**: 已切换到 FunASR paraformer-zh (非流式) + fsmn-vad + cam++，本次升级为流式+校准

## 目标

将实时语音转录从**非流式 paraformer-zh**升级为**paraformer-zh-streaming (流式) + FunASR-Nano (校准)**双模型架构，实现：

1. **直播字幕级延迟**：边说边出字，首字延迟 ~200ms，端到端 < 500ms
2. **句尾高精度校准**：FunASR-Nano 覆盖方言/口音/噪声场景
3. **GPU/CPU 分离**：流式独占 GPU，校准走 CPU，互不阻塞

## 架构概览

```
前端 MediaRecorder (PCM 16kHz, 100ms/chunk)
  │
  ▼
WebSocket /ws/realtime/session
  │
  ├─► fsmn-vad (CPU, 1M)        — 语音活动检测，标记段边界
  ├─► paraformer-zh-streaming (GPU, 220M) — 逐 chunk 流式推理，实时出字
  ├─► FunASR-Nano (CPU, 800M)   — 句尾异步校准，覆盖方言/口音/噪声
  └─► cam++ (CPU, 7M)           — 说话人聚类（不变）
```

## 数据流

```
时间线（单个 VAD 段 "我觉得这个产品还可以的"）：

t=0ms     VAD 检测到说话开始，分配 segment_id="seg_01"
t=200ms   流式 chunk → {segment_id:"seg_01", is_partial:true, text:"我觉"}
t=400ms   流式 chunk → {segment_id:"seg_01", is_partial:true, text:"我觉得这个"}
t=600ms   流式 chunk → {segment_id:"seg_01", is_partial:true, text:"我觉得这个产品"}
t=800ms   流式 chunk → {segment_id:"seg_01", is_partial:true, text:"我觉得这个产品还可以的"}
t=1.5s    VAD 段结束，streaming model final
          → {segment_id:"seg_01", is_partial:false, text:"我觉得这个产品还可以的", calibrated:false}

          ⏳ 异步提交 Nano 校准（CPU 后台），GPU 继续处理下一句话...

t=1.8s    Nano 校准完成
          → {segment_id:"seg_01", is_partial:false, text:"我觉得这个产品还可以的", calibrated:true}
          前端 → 匹配 segment_id → 替换文字 + 绿色闪烁
```

## 组件设计

### 1. StreamingASRProcessor（新增）

逐 chunk 流式中文语音转写，替代当前的非流式 `ASRProcessor.transcribe()`。

```
paraformer-zh-streaming (220M)
device: "cuda" (独占 GPU，延迟敏感)
chunk_size: [0, 10, 5]  (回看0 / 当前600ms / 前瞻300ms)
encoder_chunk_look_back: 4
decoder_chunk_look_back: 1
```

接口：

```python
class StreamingASRProcessor:
    """逐 chunk 流式中文语音转写，Paraformer-zh-streaming (220M CUDA)"""

    def __init__(self, sample_rate: int = 16000):
        self._model = None          # lazy load singleton
        self._cache = {}            # streaming cache，每个 VAD 段重置
        self._chunk_size = [0, 10, 5]

    def transcribe_chunk(
        self, audio_bytes: bytes, is_final: bool
    ) -> tuple[str, float]:
        """
        流式推理一个 chunk。

        Returns
        -------
        (text, confidence)
          - is_final=False → 增量累计文本，用于实时字幕
          - is_final=True  → 段结束，重置 cache，返回完整文本
        """

    def reset_cache(self):
        """新 VAD 段开始时清空 cache"""
```

关键点：
- cache 生命周期：VAD 段开始时 `reset_cache()`，`is_final=True` 时自动清空
- partial text 是累计的（模型每次返回完整累计文本），前端按 segment_id upsert
- chunk_size `[0,10,5]`（回看 0 / 当前 600ms / 前瞻 300ms）— 最小延迟，无历史依赖

### 2. NanoCalibrator（新增）

句尾校准，VAD 段完成后用 FunASR-Nano 完整重转写。

```
Fun-ASR-Nano-2512 (800M)
device: "cpu" (不抢 GPU，RTF ~0.05 仍然够快)
```

接口：

```python
class NanoCalibrator:
    """句尾校准：VAD 段完整音频 → FunASR-Nano (800M CPU) 高精度重转写"""

    def __init__(self, sample_rate: int = 16000):
        self._model = None   # lazy load singleton, FunAudioLLM/Fun-ASR-Nano-2512
        self._available = False

    def calibrate(self, audio_bytes: bytes) -> tuple[str, float]:
        """
        对完整 VAD 段音频做高精度转录。

        Returns
        -------
        (text, confidence)
          加载失败 → fallback 到 ("", 0.0)，调用方使用 streaming final 结果
        """

    @property
    def available(self) -> bool:
        """Nano 模型是否加载成功"""
```

关键点：
- 非流式调用：完整音频直接 `generate(input=wav_bytes)`，简单
- fallback：如果加载失败或推理异常，返回空字符串，调用方使用 streaming final 结果
- 热词预留：接口预留 `hotword` 参数，后续可注入金融术语词典

### 3. StreamingTranscriber（改造）

适配新流程：VAD 状态机 + 流式 partial + 异步校准。

```python
class StreamingTranscriber:
    def __init__(self, ...):
        self._vad = VADProcessor(...)                        # CPU
        self._streaming_asr = StreamingASRProcessor(...)     # GPU
        self._calibrator = NanoCalibrator(...)               # CPU
        self._calib_executor = ThreadPoolExecutor(max_workers=1)
        self._pending_calibrations: dict[str, bytes] = {}    # seg_id → full_audio

    def feed_chunk(self, audio_bytes: bytes) -> list[ASRSegment]:
        """
        VAD → Streaming ASR → 返回 partial segments。
        VAD 段结束时提交异步校准任务。
        """

    def flush(self) -> list[ASRSegment]:
        """处理剩余音频，等待所有 pending 校准完成"""

    def reset(self) -> None:
        """重置所有状态"""
```

当前 `_transcribe_segments()` 的改造：

```
当前:
  - VAD 返回完整段 → 整体转录 → 返回 final

新:
  - VAD 标记 speech 状态
  - 说话中 → streaming ASR 逐 chunk → ASRSegment(is_partial=True) → 即时返回
  - 段结束 → ASRSegment(is_partial=False) → 缓存音频到 pending_calibrations
           → 异步提交 Nano 校准 → 完成后通过回调推送校准结果
```

### 4. WebSocket 协议

新增字段：`segment_id`、`is_partial`、`calibrated`

```json
// 流式逐字（partial）
{
  "type": "transcript",
  "segment_id": "seg_01",
  "start": 3.5,
  "end": 4.1,
  "text": "我觉得这个产品",
  "speaker": "speaker_1",
  "speaker_name": "客户",
  "confidence": 0.85,
  "is_partial": true
}

// streaming final（待校准）
{
  "type": "transcript",
  "segment_id": "seg_01",
  "start": 3.5,
  "end": 5.8,
  "text": "我觉得这个产品还可以的",
  "speaker": "speaker_1",
  "speaker_name": "客户",
  "confidence": 0.92,
  "is_partial": false,
  "calibrated": false
}

// Nano 校准后
{
  "type": "transcript",
  "segment_id": "seg_01",
  "start": 3.5,
  "end": 5.8,
  "text": "我觉得这个产品还可以的",
  "speaker": "speaker_1",
  "speaker_name": "客户",
  "confidence": 0.96,
  "is_partial": false,
  "calibrated": true
}
```

## 前端改动

### useRealtimeASR.ts

```
当前：收到 transcript → append 到列表
改为：
  is_partial:true       → upsert 到列表（按 segment_id）
                        → 灰色斜体 + 脉冲点
  is_partial:false,
  calibrated:false      → replace 同 segment_id
                        → 正式样式 + ⏳ 待校准图标
  calibrated:true       → replace 同 segment_id
                        → 正式样式 + 绿色高亮闪烁 500ms
```

### RealtimeTranscript.tsx

| 状态 | 样式 |
|------|------|
| **流式中** | `text-gray-400 italic` + 左侧青色脉冲点 |
| **待校准** | 黑色正文 + 右侧 ⏳ 图标 |
| **已校准** | 黑色正文 + `bg-green-500/10` 闪烁 500ms |

### RealtimeCoach.tsx

- 教练触发引擎不变
- 校准完成后用 final 文本重新跑一次规则匹配（避免 partial 误触发）

## 文件变更清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `backend/app/services/realtime_asr.py` | 重写 | 新增 `StreamingASRProcessor`、`NanoCalibrator`，改造 `StreamingTranscriber` |
| `backend/app/config.py` | +3行 | `funasr_streaming_model`、`funasr_calibration_model`、`funasr_calibration_device` |
| `backend/app/routers/realtime.py` | 中等 | WebSocket 适配 `is_partial`/`calibrated`/`segment_id`，校准回调逻辑 |
| `backend/app/services/realtime_service.py` | 小 | 归档标记校准模型名称 |
| `backend/requirements.txt` | 不变 | `funasr>=1.0` 已覆盖 |
| `frontend/src/hooks/useRealtimeASR.ts` | 中等 | partial upsert、校准替换、去重逻辑 |
| `frontend/src/components/RealtimeTranscript.tsx` | 小 | 三种视觉状态样式 |
| `frontend/src/components/RealtimeCoach.tsx` | 小 | 校准后用 final 文本二次触发 |

## 错误处理 & 降级

| 情况 | 处理 |
|------|------|
| **Nano 加载失败**（OOM/下载失败） | `calibrator.available = False`，使用 streaming final 结果，不做校准 |
| **Nano 校准推理失败** | 单次失败静默跳过，使用 streaming final 结果 |
| **Streaming ASR chunk 报错** | 跳过当前 chunk，重置 cache，下一个 VAD 段重新开始 |
| **校准超时**（单段 >5s） | 放弃校准，推送 warning 日志 |
| **GPU OOM** | 卸载 Nano → 纯 streaming 工作；仍 OOM → streaming CPU 推理 |
| **WebSocket 断开** | flush 剩余音频 + 等待 pending 校准完成 + archive session |
| **Nano 校准结果与 streaming final 相同** | 不推送重复消息，避免前端闪烁 |

```
降级链:
方案B (streaming GPU + Nano CPU) → Nano 不可用 → 纯 streaming
                                  → GPU OOM → streaming CPU + Nano CPU
                                  → CPU OOM → 纯 streaming CPU
```

## 模型规格

| 模型 | 参数 | 推理时间(1s音频) | 显存/内存 | 部署位置 |
|------|------|-----------------|----------|---------|
| fsmn-vad | 1M | <1ms | ~100MB | CPU |
| paraformer-zh-streaming | 220M | ~9ms (RTF 0.009) | ~1.6GB | GPU (CUDA) |
| FunASR-Nano | 800M | ~50ms (RTF 0.05) | ~4GB | CPU |
| cam++ | 7M | ~5ms | ~200MB | CPU |
| **总计** | **~1B** | — | **~5.8GB** | GPU 1.6GB + CPU ~4.3GB |

## 实施步骤

| # | 步骤 | 内容 |
|---|------|------|
| 1 | config | 新增 `funasr_calibration_model`、`funasr_calibration_device` 配置项 |
| 2 | StreamingASRProcessor | 实现流式 chunk 推理 + cache 管理 |
| 3 | NanoCalibrator | 实现完整段推理 + fallback |
| 4 | StreamingTranscriber | 改造 VAD 状态机 + 校准队列 + 异步执行 |
| 5 | WebSocket | 适配 `segment_id`/`is_partial`/`calibrated`，校准回调 |
| 6 | 前端 | useRealtimeASR 去重逻辑 + RealtimeTranscript 三种视觉状态 |
| 7 | 集成测试 | 端到端流式 + 校准验证 + 降级测试 |

## 未涵盖

- 双声道分离（预留，后续 Phase）
- TTS 语音打断集成（Phase 4，本次不改）
- 售后分析音频转录（post_sales_service.py 仍用非流式 paraformer-zh，不在本次范围）
- 热词注入（接口预留，不在本次实现）
