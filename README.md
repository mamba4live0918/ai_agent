# AI 销售助手 — 陪跑助手 + 仿真培训

AI 驱动的销售全流程辅助平台，覆盖售前/售中/售后完整链路。核心功能：知识库 RAG 问答 + KB 优先生成、客户画像分析（6 维评分+雷达图）、售前准备报告（5 板块）、资产配置方案（3 套风险等级+手动调整）。

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端框架** | FastAPI (Python 3.11) |
| **数据库** | PostgreSQL (结构化数据) + ChromaDB (向量存储) |
| **ORM** | SQLAlchemy + Alembic (迁移) |
| **LLM** | DeepSeek (`deepseek-reasoner`) |
| **Embedding** | Jina AI (`jina-embeddings-v3`) |
| **语音转录** | faster-whisper `large-v3-turbo` + OpenCC `t2s` 简繁转换 + ffmpeg |
| **说话人分离** | pyannote.audio `speaker-diarization-3.1` + 在线聚类 (cosine similarity + EMA centroid) |
| **VAD** | Silero-VAD ONNX (8kHz, 32ms 窗口) |
| **TTS** | edge-tts (`zh-CN-XiaoxiaoNeural`) |
| **文档处理** | LangChain (PDF/DOCX/TXT/MD/PPTX) |
| **前端** | React 19 + TypeScript + Vite + Tailwind CSS 3 + Recharts (响应式适配移动端/宽窄屏) |
| **桌面应用** | Tauri v2（Windows MSI/NSIS 安装包） |

## 项目结构

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口，CORS，路由注册
│   │   ├── config.py            # 环境变量配置
│   │   ├── database.py          # SQLAlchemy engine + session
│   │   ├── models/              # ORM 模型
│   │   │   ├── user.py          # User (含 hashed_password, role, group_id)
│   │   │   ├── group.py         # Group (含 admin_id FK→users)
│   │   │   ├── knowledge.py     # Category, Document
│   │   │   ├── customer.py      # Customer (含 presales_prep, allocation_plan JSONB)
│   │   │   ├── product.py       # Product (含 nav_history JSONB)
│   │   │   ├── training.py      # TrainingSession / Message / Review
│   │   │   ├── post_sales.py    # PostSalesSession / PostSalesMessage
│   │   │   ├── feedback.py      # Feedback (评分 + 评价)
│   │   │   ├── realtime_session.py  # RealtimeSession / RealtimeSegment / RealtimeCoachEvent
│   │   │   └── chat.py           # ChatConversation / ChatMessage (对话持久化)
│   │   ├── schemas/             # Pydantic 请求/响应
│   │   │   ├── auth.py          # UserRegister, UserLogin, UserResponse, TokenResponse
│   │   │   ├── instructor.py    # TrainingStatsOverview, PerUserStats, TrainingTrendPoint
│   │   │   ├── training.py      # 训练相关 Pydantic 模型
│   │   │   ├── post_sales.py    # 售后分析 Pydantic 模型
│   │   │   ├── feedback.py      # 反馈 Pydantic 模型
│   │   │   └── group.py         # 分组管理 Pydantic 模型
│   │   ├── routers/             # API 路由
│   │   │   ├── auth.py          # 注册/登录/当前用户/用户管理
│   │   │   ├── knowledge.py     # 知识库 CRUD + 文档上传/删除（含 ChromaDB 清理）
│   │   │   ├── customer.py      # 客户 CRUD + AI 分析 + 售前准备 + 配置方案
│   │   │   ├── product.py       # 产品库 CRUD + CSV 批量导入
│   │   │   ├── training.py      # 仿真培训 API（7 端点）
│   │   │   ├── instructor.py    # 讲师端口统计 + CSV 导出
│   │   │   ├── post_sales.py    # 售后分析（会话 + 音频上传 + 报告生成）
│   │   │   ├── feedback.py      # 用户反馈（提交/统计/管理员查看）
│   │   │   ├── groups.py        # 分组管理 CRUD + 成员管理
│   │   │   ├── realtime.py      # WebSocket 实时语音陪跑（ASR + 教练 + TTS）
│   │   │   └── chat.py          # RAG 问答
│   │   ├── services/
│   │   │   ├── rag_service.py   # DeepSeek 推理 + 对话管理 + 知识库检索工具
│   │   │   ├── embedding_service.py  # ChromaDB 索引（分批嵌入，中文友好分割）
│   │   │   ├── customer_service.py   # 客户 AI 画像 + 售前准备生成（KB 优先）
│   │   │   ├── allocation_service.py # 资产配置方案生成（保守/稳健/进取）
│   │   │   ├── training_service.py   # 客户模拟 + 教练提示 + 复盘报告（KB 优先）
│   │   │   ├── fund_service.py       # 东方财富 API 获取真实基金净值走势
│   │   │   ├── post_sales_service.py # 音频转录 + 售后报告 + KB 匹配
│   │   │   ├── realtime_asr.py       # 实时 ASR 流水线（VAD + faster-whisper）
│   │   │   ├── speaker_clustering.py # 在线说话人聚类（pyannote embedding）
│   │   │   ├── trigger_engine.py     # 触发器引擎（YAML 规则 + DeepSeek 教练提示）
│   │   │   ├── realtime_service.py   # 实时会话归档（bulk persist）
│   │   │   └── tts_service.py        # edge-tts 语音合成 + 流式输出
│   │   └── utils/
│   │       ├── auth.py              # JWT + bcrypt + 认证依赖注入 + 用户/文档过滤
│   │       └── document_loader.py    # 文档加载 (PDF/DOCX/TXT/MD/PPTX)
│   ├── alembic/                 # 数据库迁移
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # 路由配置
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # 首页统计
│   │   │   ├── KnowledgeBase.tsx    # 知识库（分类筛选 + 上传 + RAG 对话）
│   │   │   ├── CustomerAnalysis.tsx # 客户列表（搜索 + 分页 + CRUD）
│   │   │   ├── Training.tsx         # 仿真培训（会话列表 + 聊天 + 复盘弹窗）
│   │   │   ├── PostSalesAnalysis.tsx # 售后分析（会话列表 + 新建）
│   │   │   ├── RealTimeVoice.tsx    # 实时语音陪跑主页面
│   │   │   ├── Feedback.tsx         # 用户反馈（星级评分 + 统计）
│   │   │   ├── AdminUsers.tsx       # 用户管理（列表/角色/添加/删除）
│   │   │   ├── AdminFeedback.tsx    # 反馈总览（管理员查看全部）
│   │   │   ├── AdminGroups.tsx      # 分组管理（CRUD + 成员管理）
│   │   │   └── InstructorDashboard.tsx # 讲师统计面板 + CSV 导出
│   │   ├── components/
│   │   │   ├── Layout.tsx       # GitHub 风格侧边栏布局（含主题切换）
│   │   │   ├── ChatPanel.tsx    # RAG 问答面板
│   │   │   ├── CustomerForm.tsx # 客户录入（自由文本/表单）
│   │   │   ├── CustomerProfile.tsx   # 客户详情（3 Tab：分析/售前准备/配置方案）
│   │   │   ├── CustomerRadar.tsx     # 6 维评分雷达图
│   │   │   ├── AllocationPlan.tsx    # 3 套配置方案 + 手动调整 + 图表
│   │   │   ├── ProductManager.tsx    # 产品库管理（CRUD + CSV 导入 + 分页）
│   │   │   ├── ProductNavChart.tsx   # 产品净值走势图
│   │   │   ├── CategoryNav.tsx  # 分类导航
│   │   │   ├── DocumentUpload.tsx    # 文档上传（带进度条）
│   │   │   ├── SearchBar.tsx    # 搜索栏
│   │   │   ├── SessionList.tsx      # 训练记录侧边栏
│   │   │   ├── SessionSidebar.tsx   # 会话侧边栏（共享组件）
│   │   │   ├── PersonaForm.tsx      # 手动创建数字人客户
│   │   │   ├── TrainingSession.tsx  # 训练聊天 + 教练实时提示
│   │   │   ├── TrainingReview.tsx   # 复盘报告（雷达图 + 话术 + PDF）
│   │   │   ├── PostSalesSession.tsx # 售后对话（录音/上传/手动输入）
│   │   │   ├── PostSalesReport.tsx  # 售后报告（雷达图/情绪轨迹/PDF）
│   │   │   ├── RealtimeTranscript.tsx # 实时转录面板（说话人彩色标签）
│   │   │   ├── RealtimeCoach.tsx    # 实时教练提示（打字机效果）
│   │   │   ├── PdfPreview.tsx       # 原生浏览器 PDF 预览弹窗
│   │   │   ├── TauriTitlebar.tsx    # Windows 桌面应用自定义标题栏
│   │   │   └── FeedbackForm.tsx     # 反馈表单（星级 + 评价）
│   │   ├── services/api.ts      # API 调用封装（含上传进度跟踪）
│   │   └── types/index.ts       # TypeScript 类型定义
│   ├── tailwind.config.js       # GitHub Primer 暗色主题配置
│   └── package.json
├── documents/                   # 原始文档（原型用）
├── main.py                      # 原始 Gradio RAG 原型（保留参考）
├── .env.example                 # 环境变量模板
├── CLAUDE.md                    # 项目开发指南
└── README.md
```

## 快速开始

### 前置条件

- **Python 3.11** + 虚拟环境
- **PostgreSQL**（默认 `localhost:5432`，数据库 `ai_agent`）
- **Jina AI Key**（免费额度 100 万 token/天）
- **Node.js** 18+
- **3 个服务缺一不可**：PostgreSQL → Backend → Frontend

### 1. 环境配置

```bash
cp .env.example .env
# 编辑 .env，填入你的配置：
#   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/ai_agent
#   DEEPSEEK_API_KEY=your-deepseek-api-key
```

### 2. 后端

```bash
cd backend
pip install -r requirements.txt

# 数据库迁移
alembic upgrade head

# 启动 (端口 8000)
uvicorn app.main:app --reload --port 8000
```

API 文档：http://localhost:8000/docs

### 3. 前端

```bash
cd frontend
npm install
npm run dev
```

浏览器打开 http://localhost:5173

### 4. 初始数据

首次启动后，后端会自动创建 4 个知识分类：
- 财经法税 / 沟通技巧 / 行业知识 / 销售案例

产品数据通过前端界面手动添加或 CSV 批量导入。基金产品填入基金代码后自动从东方财富拉取真实净值数据。

## 用户认证

系统有三种角色：**admin**（管理员）、**instructor**（讲师，看全部数据 + 讲师端口）、**salesperson**（销售，仅看自己的数据）。

管理员分为两级：
- **超级管理员**（role=admin, group_id=NULL）：管理所有用户、分组和反馈，创建/删除分组，分配分组管理员
- **分组管理员**（role=admin, group_id=<group>）：仅管理自己分组的成员，查看组内用户和反馈

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（默认 salesperson） |
| POST | `/api/auth/login` | 登录 → JWT token |
| GET | `/api/auth/me` | 当前用户信息 |
| GET | `/api/auth/users` | 用户列表（超级管理员看全部，分组管理员看组内） |
| POST | `/api/auth/users` | 创建用户（仅超级管理员） |
| PATCH | `/api/auth/users/{id}/role` | 修改角色（仅超级管理员） |
| DELETE | `/api/auth/users/{id}` | 删除用户（仅超级管理员） |

默认超级管理员：`admin` / `admin123`

### 数据隔离

- **客户 / 训练会话**：超级管理员看全部，分组管理员看组内数据，普通用户仅看自己的
- **知识库文档**：user_id=NULL 为基础文档（全员可见），非 NULL 为个人文档
- **产品库**：管理员创建的产品 user_id=NULL（共享全员可见），普通用户创建的仅自己可见

## API 端点

### 分组管理（需管理员角色）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/groups` | 分组列表（超级管理员看全部，分组管理员看自己的） |
| POST | `/api/groups` | 创建分组（仅超级管理员） |
| PATCH | `/api/groups/{id}` | 更新分组名称/描述/管理员 |
| DELETE | `/api/groups/{id}` | 删除分组（仅超级管理员，成员自动取消分组） |
| GET | `/api/groups/{id}/members` | 分组成员列表 |
| POST | `/api/groups/{id}/members/{user_id}` | 添加用户到分组 |
| DELETE | `/api/groups/{id}/members/{user_id}` | 从分组移除用户 |

### 讲师端口（需 admin/instructor 角色）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/instructor/statistics/overview` | 训练统计概览 |
| GET | `/api/instructor/statistics/per-user` | 按用户细分统计 |
| GET | `/api/instructor/statistics/trends` | 训练趋势 `?granularity=weekly\|monthly` |
| GET | `/api/instructor/reports/export` | 导出 CSV 报表 |

### 知识库
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/knowledge/categories` | 分类列表 (含文档数) |
| POST | `/api/knowledge/categories` | 创建分类 |
| GET | `/api/knowledge/documents` | 文档列表 `?category_id=&q=` |
| POST | `/api/knowledge/documents` | 上传文档（multipart，支持 PDF/DOCX/TXT/MD/PPTX） |
| GET | `/api/knowledge/documents/{id}` | 文档详情 |
| DELETE | `/api/knowledge/documents/{id}` | 删除文档（同步清理 ChromaDB 向量） |

### 客户分析
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/customers` | 客户列表 `?q=&page=&page_size=` (分页) |
| POST | `/api/customers` | 创建客户 |
| POST | `/api/customers/analyze` | AI 分析预览（不保存） |
| GET | `/api/customers/{id}` | 客户详情 + AI 画像 |
| PUT | `/api/customers/{id}` | 更新客户 |
| DELETE | `/api/customers/{id}` | 删除客户 |
| POST | `/api/customers/{id}/presales-prep` | 生成售前准备报告 |
| POST | `/api/customers/{id}/allocation-plan` | 生成资产配置方案（3 套） |
| PUT | `/api/customers/{id}/allocation-plan` | 保存手动调整的配置方案 |
| POST | `/api/customers/{id}/regenerate-profile` | 重新生成 AI 画像（可选 `structured_data`，AI 优先采用人工编辑） |

### 产品库
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/products` | 产品列表 `?type=&risk_level=&q=&page=&page_size=` |
| POST | `/api/products` | 创建产品 |
| GET | `/api/products/{id}` | 产品详情（含净值走势） |
| PUT | `/api/products/{id}` | 更新产品 |
| DELETE | `/api/products/{id}` | 删除产品 |
| POST | `/api/products/batch` | CSV 批量导入 |
| POST | `/api/products/{id}/refresh-nav` | 刷新基金净值（从东方财富实时拉取） |

### RAG 问答
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | `{"message", "conversation_id"?}` → `{"answer", "sources", "conversation_id"}` |

### 售后分析
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/post-sales/sessions` | 创建售后会话（可选 `customer_id` 关联客户） |
| GET | `/api/post-sales/sessions` | 会话列表 `?status=&page=&page_size=` |
| GET | `/api/post-sales/sessions/{id}` | 会话详情（含消息 + 报告） |
| PATCH | `/api/post-sales/sessions/{id}` | 更新会话（关联/解除客户） |
| DELETE | `/api/post-sales/sessions/{id}` | 删除会话 |
| POST | `/api/post-sales/sessions/{id}/messages` | 添加对话消息（text / role） |
| POST | `/api/post-sales/sessions/{id}/audio` | 上传音频文件（自动转录 + 说话人分离） |
| POST | `/api/post-sales/sessions/{id}/end` | 结束通话 → AI 生成分析报告 |

### 用户反馈
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/feedback` | 提交反馈 `{"rating": 1-5, "comment"?}` |
| GET | `/api/feedback/my` | 我的反馈列表 |
| GET | `/api/feedback/statistics` | 反馈统计（总数/平均分/分布） |
| GET | `/api/feedback/admin` | 管理员查看全部反馈（分组管理员仅看组内） |

### 实时语音陪跑
| 方法 | 路径 | 说明 |
|------|------|------|
| WS | `/ws/realtime/session` | WebSocket 实时语音会话（二进制音频 + JSON 消息） |
| GET | `/api/realtime/sessions` | 历史会话列表 |
| GET | `/api/realtime/sessions/{id}` | 会话回放（含分段 + 教练事件） |

### 仿真培训
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/training/sessions` | 训练会话列表 `?customer_id=&status=&page=&page_size=` |
| POST | `/api/training/sessions` | 创建训练会话（基于客户或手动创建数字人） |
| GET | `/api/training/sessions/{id}` | 会话详情（含消息 + 复盘报告） |
| POST | `/api/training/sessions/{id}/messages` | 发送消息 → 双 Agent 回复（客户 + 教练） |
| POST | `/api/training/sessions/{id}/end` | 结束训练 → 生成结构化复盘报告 |
| GET | `/api/training/sessions/{id}/review` | 单独获取复盘报告 |
| DELETE | `/api/training/sessions/{id}` | 删除训练会话（级联清理消息和复盘） |

## 核心功能

**用户认证与权限**
- JWT 认证（python-jose + bcrypt），注册/登录/自动续期
- 三种角色：admin（管理员）/ instructor（讲师）/ salesperson（销售）
- 管理员分级：超级管理员（group_id=NULL，管所有）+ 分组管理员（group_id=<group>，管本组）
- 数据按用户隔离：客户、产品、训练会话各归属创建者
- 知识库文档和产品支持共享模式（user_id=NULL = 全员可见）
- 管理员创建的文档/产品自动设为共享，普通用户创建的仅自己可见

**用户分组管理**
- 超级管理员可创建分组、设置分组管理员
- 分组管理员只能管理自己组内的成员和查看组内反馈
- 支持添加/移除分组成员，成员自动关联分组
- 删除分组时成员自动取消分组（group_id 置 NULL）

**讲师端口**
- 训练统计概览：总用户数/总会话数/完成率/平均分
- 按用户细分统计表：每个用户的训练数据（总会话/已完成/平均分/最近训练）
- 训练趋势图：按周/月柱状图（总会话 + 已完成）+ 平均分折线叠加
- 一键导出 CSV 报表（含评分/表达逻辑/专业准确度/情绪情商）

**知识库**
- 分类浏览（财经法税/沟通技巧/行业知识/销售案例）
- 文档上传自动索引到 ChromaDB（PDF/DOCX/TXT/MD/PPTX），带上传进度条
- 文档按用户隔离 + 基础共享文档（user_id=NULL）全员可见
- 全文搜索 + RAG 智能问答（上下文感知，跨文档推理）
- PDF 文档支持原生浏览器内预览（iframe + blob URL，工具栏/导航面板完整可用）
- 删除文档同步清理 ChromaDB 向量

**知识库优先生成（KB-First）**
- 所有 AI 生成（客户分析/售前准备/资产配置）调用 LLM 前先检索知识库
- 匹配到相关文档 → 注入 prompt 优先参考
- 无匹配或检索失败 → 静默回退纯 LLM 生成

**客户分析**
- 自由文本导入：粘贴客户描述 → DeepSeek 提取结构化画像
- 表单录入：手动填写客户基本信息
- AI 6 维评分（财富规模/风险承受力/投资经验/需求紧迫度/客户潜力/沟通难度），基于 Rubric 客观打分
- 雷达图可视化（Recharts）+ 评分进度条卡片
- AI 深度分析报告：6 大板块各 4-6 句详细分析
- 一键导出 PDF（含雷达图 + 完整分析报告，自动分页）

**售前准备**
- 基于已有客户画像，AI 一键生成售前策略报告
- 5 大板块：生命周期分析 / 潜在难点 / 应对话术 / 心态准备 / 维护动作
- 报告保存到客户档案，支持 PDF 导出
- 支持从客户详情页一键"发起训练"进入仿真培训

**仿真培训（AI 数字人对练）**
- 两种创建方式：客户分析页一键发起（使用客户画像），或手动创建数字人画像（年龄/性别/职业/性格/投资偏好等）
- 双 Agent 架构：customer agent（t=0.7）模拟真实客户行为，coach agent（t=0.3）实时生成教练建议
- 教练 4 维提示：策略建议 / 话术矫正 / 销售金句 / 情绪感知 — 每条用户消息即时触发
- 60 秒空闲检测：输入框无操作自动请求 LLM 生成回复思路建议
- 对话自然结束检测：客户 agent 判断对话是否已结束，提示用户生成复盘
- 实时持久化：每条消息即时存入数据库，导航离开再回来可继续未完成训练
- 结构化复盘报告：评分（表达逻辑/专业准确度/情绪情商/综合）+ 雷达图 + 话术对比点评 + 技能短板分析 + 下一步行动建议
- 复盘持久化保存：完成后训练记录标记 📊，可随时回看历史复盘追溯进步，支持 PDF 导出
- 会话恢复：URL 参数 + sessionStorage 双重持久化，刷新/导航不丢失当前会话
- 级联删除：删除训练会话自动清理关联消息和复盘记录

**资产配置方案**
- 基于客户画像和产品库，AI 生成 3 套配置方案（保守型/稳健型/进取型）
- 堆叠柱状图可视化各方案产品配比
- 支持手动调整配比（滑块 + 数值输入），实时校验总和 100%
- 方案切换（AI 方案 / 用户方案）对比

**产品库**
- 支持多种产品类型：基金、保险、理财、信托、结构化、其他
- 产品 CRUD + CSV 批量导入（带进度条）
- 分页列表 + 类型/风险筛选 + 搜索
- 基金填入代码后自动从东方财富拉取近 12 个月真实净值走势
- 净值每 4 小时自动刷新 / 展开卡片时智能检测刷新
- 非基金产品显示"未获得实时数据"提示

**基本信息九宫格编辑器**
- 所有客户显示可编辑的 3×3 基本信息九宫格（年龄/性别/职业/收入水平/资产状况/风险偏好/投资经验/家庭状况/理财目标）
- 每个格子独立编辑保存，信息不足留空不强制
- 重新生成时人工编辑数据随请求发送，AI 标注为最高优先级，严格采用不再推断
- `PUT /api/customers/{id}` 保存编辑，`POST /api/customers/{id}/regenerate-profile` 支持 `structured_data` 入参

**KYC 九宫格**
- 高净值客户（资产 >500 万）自动显示华兴银行 KYC 九宫格
- 严格基于已有数据映射，不 AI 虚构，缺失字段编辑角标提示手动补充
- AI 分析报告 ↔ KYC 九宫格一键切换
- AI 画像支持重新生成（`regenerate-profile`）

**PDF 导出**
- html2canvas (scale:3) + jsPDF，浅色主题，中文渲染清晰
- 按内容区块分块捕获，不分页切断段落或图表
- 操作按钮自动隐藏，高净值客户 KYC 九宫格自动包含
- 未生成内容不会出现

**Dashboard**
- 文档/客户/产品 三项统计 + 3 大功能模块快捷入口
- 独立产品库页面（`/products`），侧边栏导航
- 系统组件健康状态

**售后分析（Post-Sales Analysis）**
- 录音/上传/手动输入三种方式记录销售对话
- faster-whisper `large-v3-turbo` 自动语音转录 + OpenCC 繁→简转换
- pyannote.audio 说话人分离（最多 4 人，按发言时长映射为 销售/客户/其他）
- 客户关联：`PATCH /sessions/{id}` 支持关联/解除客户
- AI 分析报告浮窗弹窗：综合评分 + 通话摘要 + 情绪轨迹图 + 对话占比饼图 + 能力评估雷达图 + 成交概率仪表盘 + 关键时刻时间线 + 错失机会 + 优势/待改进 + 知识库匹配
- 报告支持 html2canvas + jsPDF 导出

**实时语音陪跑（Real-time Voice AI）**
- WebSocket 实时音频流传输（MediaRecorder API → 100ms 分片 → 服务端处理）
- 四阶段流水线：Silero-VAD 语音检测 → faster-whisper 实时转录 → 说话人在线聚类 → 教练触发器引擎
- ASR：faster-whisper `large-v3-turbo` INT8 CPU 推理，OpenCC 简繁转换
- 说话人聚类：pyannote embedding (512 维) + 增量余弦相似度匹配 + EMA 质心更新 (alpha=0.3)
- 教练触发器引擎：8 条 YAML 规则（犹豫/价格异议/竞品提及/承诺信号/反对/长静默/多人讨论/情绪转变），DeepSeek 流式生成提示
- TTS 语音合成：edge-tts (`zh-CN-XiaoxiaoNeural`) + 语音打断检测（RMS 音量监测，阈值 0.08）
- 前端：实时转录面板（说话人彩色标签）+ 教练提示侧边栏（打字机效果 + 自动消失/钉住）
- 会话归档：WebSocket 断开后 bulk persist 到 PostgreSQL，支持历史回放

**用户反馈系统**
- 星级评分（1-5 星）+ 文字评价
- 用户查看自己的反馈记录 + 展开查看详情
- 管理员查看全部反馈（分组管理员仅看组内）
- 反馈统计：总数/平均分/评分分布

**主题切换**
- CSS 自定义属性驱动的双主题（暗色 GitHub-dark + 奶油色 Light Mode）
- ThemeContext 持久化到 localStorage，刷新保持主题偏好
- 侧边栏底部一键切换太阳/月亮图标

**桌面应用（Tauri v2）**
- Windows 原生安装包（MSI/NSIS），自动包含前后端依赖
- 自定义标题栏（`TauriTitlebar`）：最小化/最大化/关闭 + 窗口拖拽
- 构建命令：`cd frontend && npm run tauri build`
- 开发模式：`cd frontend && npm run tauri dev`

**对话持久化**
- 知识库 RAG 对话自动持久化到 PostgreSQL（`ChatConversation` + `ChatMessage` 模型）
- 对话按用户隔离命名空间，支持历史会话恢复
- 会话列表支持查看/删除（级联清理消息）

**毛玻璃侧边栏系统（Frosted Glass Sidebar）**
- 所有模块侧边栏统一设计：`.sidebar-glass` CSS 类驱动
- Dark mode：10% 不透明度 + 40px 强模糊，极致玻璃质感
- Light mode：实色背景 + 浅阴影，清晰可读
- 展开按钮统一设计：浮动药丸形状，半透明玻璃质感 + hover 加深动画
- 折叠时仅露 4px，侧边栏内容完全不可见
- 卡片 hover 阴影动画：`hover:shadow-lg` + `transition-all duration-200`
- 统一规格：宽度 220/240px，标题栏 `backdrop-blur-md`，卡片 `rounded-xl border backdrop-blur-md`

**客户分析浮窗**
- 客户详情从内嵌右侧卡片改为居中毛玻璃浮窗（`max-w-3xl`, `max-h-[90vh]`）
- 背景遮罩 `bg-black/40 backdrop-blur-[2px]`，点击关闭
- 移动端和桌面端统一使用浮窗

**知识库弹窗**
- 知识库问答和知识库练习改为居中毛玻璃浮窗 + 暗色遮罩
- 去掉拖动功能，固定居中展示
- 点击遮罩关闭弹窗

**实时 ASR 优化**
- 去临时文件 I/O：VAD 片段直接传 numpy float32 数组给 faster-whisper
- VAD 阈值优化：`threshold=0.5`, `min_speech_duration_ms=1000`, `max_speech_duration_s=8.0`
- 说话人聚类：`similarity_threshold=0.40`，角色按检测顺序分配
- 前端说话人标签修复：speaker→讲话人/销售/客户/其他

**暗色模式白边清理**
- 全局替换硬编码 `border-gray-500/30` → `border-[var(--border-subtle)]`
- 移除 `--shadow-card` 中的白色环形阴影（`rgba(255,255,255,0.04)`）
- 浮动面板：去掉 `backdrop-blur-xl` + 半透明背景，改纯色
- `.btn-primary` 白色内阴影降至 3% 不可见
- `.card` 类 `border: none` 覆盖问题修复（加 `border-solid`）
- 全局滚动条窄化至 4px + 更低调的滑块色

## License

MIT
