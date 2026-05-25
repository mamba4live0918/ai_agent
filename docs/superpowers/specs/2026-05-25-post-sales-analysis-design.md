# 售后分析 — 设计文档

**日期**: 2026-05-25
**状态**: 设计中

---

## 概述

销售与客户通完电话后，系统化记录和分析通话内容。流程：录音/笔记 → 上传 → 转写+说话人分离 → AI逐条分析+KB匹配 → 生成可视化报告。

### 与仿真培训的区别

| | 仿真培训 | 售后分析 |
|---|---|---|
| 数据来源 | AI模拟客户 | 真实录音+笔记 |
| AI角色 | 数字人客户+实时教练 | 通话后分析师 |
| 交互模式 | 实时对话 | 记录→上传→处理→报告 |
| 语音 | 无需 | faster-whisper转写+pyannote分离 |

---

## 核心流程

```
创建会话 → 记录通话(录音+笔记) → 结束 → 后台处理(转写+分离+AI分析+KB匹配) → 生成报告(图表+逐条点评)
```

---

## 后端设计

### 数据模型 (`backend/app/models/post_sales.py`)

```python
PostSalesSession:
  id UUID PK, user_id FK→users, customer_id FK→customers(nullable)
  status: recording|processing|completed
  summary JSONB(nullable), report JSONB(nullable)
  started_at, completed_at
  messages → PostSalesMessage (cascade delete)

PostSalesMessage:
  id UUID PK, session_id FK→sessions (CASCADE)
  role: salesperson|customer|system
  content Text, audio_file String(nullable)
  analysis JSONB(nullable), created_at
```

### API端点 (`backend/app/routers/post_sales.py`)

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/post-sales/sessions` | 创建会话 |
| GET | `/api/post-sales/sessions` | 列表(分页+筛选) |
| GET | `/api/post-sales/sessions/{id}` | 详情(含消息) |
| POST | `/api/post-sales/sessions/{id}/messages` | 添加文字 |
| POST | `/api/post-sales/sessions/{id}/audio` | 上传录音,转写+分离 |
| POST | `/api/post-sales/sessions/{id}/end` | 结束,生成报告 |
| DELETE | `/api/post-sales/sessions/{id}` | 删除 |

### Service (`backend/app/services/post_sales_service.py`)

- `transcribe_audio(file_path)` — ffmpeg→16kHz WAV → faster-whisper large-v3 → pyannote diarization → merge → speaker-labeled segments
- `generate_report(messages, customer_profile, kb_context)` — DeepSeek生成完整报告含: 摘要/情绪轨迹/关键时刻/错失机会/逐条点评/能力雷达/成交概率
- `match_kb_resources(messages, customer_profile)` — ChromaDB检索匹配话术模板和案例

### Config新增

```python
audio_upload_dir: str = "./audio_uploads"
huggingface_token: str = ""
```

### 依赖

```
faster-whisper==1.2.0
pyannote.audio==3.4.1
```

---

## 前端设计

### 页面 (`frontend/src/pages/PostSalesAnalysis.tsx`)
左右分栏：会话列表(左268px) + 主内容区。URL参数支持customerId/sessionId。

### 组件 (`frontend/src/components/PostSalesSession.tsx`)
- 头部: 客户信息+状态标签+"结束通话"
- 对话区: 角色标签(销售/客户/系统),来源图标(文字/录音)
- 输入区: 文字+录音按钮(MediaRecorder)+文件上传
- 语音处理: 上传后显示"转写+分离中,预计X分钟"进度提示

### 报告 (`frontend/src/components/PostSalesReport.tsx`)
基于Recharts的5个图表:
1. **情绪轨迹折线图** — X对话轮次/Y情绪分数,客户线+销售线
2. **对话占比饼图** — 环形图,销售vs客户发言比
3. **能力雷达图** — 5维: 沟通效率/需求挖掘/异议处理/促成技巧/专业度
4. **成交概率仪表盘** — 半圆环形,中心百分比+等级
5. **关键时刻时间线** — CSS垂直时间线,绿/黄/红标记

支持PDF导出(html2canvas+jsPDF)。

### 导航
侧边栏新增"售后分析"→ `/post-sales`。

---

## 文件变更清单

| # | 操作 | 文件 |
|---|------|------|
| 1 | 新增 | `backend/app/models/post_sales.py` |
| 2 | 修改 | `backend/app/models/__init__.py` |
| 3 | 新增 | `backend/app/schemas/post_sales.py` |
| 4 | 新增 | `backend/app/services/post_sales_service.py` |
| 5 | 新增 | `backend/app/routers/post_sales.py` |
| 6 | 修改 | `backend/app/main.py` |
| 7 | 修改 | `backend/app/config.py` |
| 8 | 修改 | `backend/requirements.txt` |
| 9 | 修改 | `frontend/src/types/index.ts` |
| 10 | 修改 | `frontend/src/services/api.ts` |
| 11 | 新增 | `frontend/src/pages/PostSalesAnalysis.tsx` |
| 12 | 新增 | `frontend/src/components/PostSalesSession.tsx` |
| 13 | 新增 | `frontend/src/components/PostSalesReport.tsx` |
| 14 | 修改 | `frontend/src/components/Layout.tsx` |
| 15 | 修改 | `frontend/src/App.tsx` |

---

## 约束与风险

- 首次模型下载: faster-whisper large-v3(~3GB)+pyannote(~2GB)
- CPU处理10分钟音频需20-50分钟,前端显示明确进度
- ffmpeg用户已安装,后端启动检查`shutil.which("ffmpeg")`
- pyannote需HF token,加入.env的HUGGINGFACE_TOKEN
- KB为空时静默降级,不阻塞报告生成
