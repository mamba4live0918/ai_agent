# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目目标

构建"陪跑助手 + 仿真培训"双核心场景的销售辅助平台：

**陪跑助手** — 覆盖售前/售中/售后的全流程销售辅助系统：
- 客户分析：导入客户信息（文字），画像分析，信息存档查询，导出电子文档
- 资产配置方案：导入金融产品信息，生成配置方案，导出文档
- 售前准备：基于客户生命周期生成营销建议（潜在难点、应对话术、心态准备、维护动作），支持仿真培训预演
- 售中辅助：记录销售过程，（后续：实时语音识别客户情绪/意向/问题，提供应对话术/避坑建议/促销策略）
- 售后分析：生成客户销售档案（分类/查询/萃取/删除），导出电子表格，给出评价与行动建议
- 销售辅助知识库：财经法税知识、沟通技巧、行业知识、销售案例等
- 用户激励：评价、反馈、分享

**仿真培训** — AI数字人对练系统：
- AI数字人客户：根据客户信息自动生成合适的数字人画像（年龄/性别/职业/性格等），沉浸式语音对话模拟不同销售场景（客诉处理、产品讲解、异议处理）
- AI数字人教练：实时提供策略建议、话术矫正、销售金句，复盘点评表达逻辑/专业准确度/情绪情商，记录训练过程并归档
- 预留讲师端口：统计训练结果，导出报表，学练考评闭环

**终端支持**：PC端 + 移动端双端访问 + Windows 桌面应用（Tauri v2）
**当前开发阶段**：文字交互 + 售后语音转录 + 实时语音陪跑（含 ASR/说话人分离/教练触发/TTS）

## 当前状态

项目已拆分为正式的前后端架构。`main.py` 是早期的 RAG 原型（Gradio），保留作为技术参考。

### 项目结构

```
backend/     FastAPI (port 8000)
frontend/    React 19 + TypeScript + Vite (port 5173)
```

### 后端模块

- `routers/auth.py` — 用户注册/登录/获取当前用户（JWT + bcrypt）
- `routers/knowledge.py` — 知识库 CRUD（分类 + 文档上传/删除），文档按用户隔离
- `routers/customer.py` — 客户 CRUD + 分析 + 售前准备 + 配置方案 + 画像重新生成
- `routers/product.py` — 产品库 CRUD + CSV 批量导入 + 净值自动刷新
- `routers/chat.py` — 知识库 RAG 问答，对话按用户命名空间隔离
- `routers/training.py` — 仿真培训 API（7 端点：创建/列表/详情/发消息/结束/复盘/删除）
- `routers/instructor.py` — 讲师端口（统计概览/按用户统计/训练趋势/CSV 导出）
- `routers/post_sales.py` — 售后分析（7 端点：会话 CRUD + 消息 + 音频上传 + 结束生成报告）
- `routers/feedback.py` — 用户反馈（提交/我的反馈/统计/管理员全量查看，分组管理员仅看组内）
- `routers/groups.py` — 分组管理 CRUD + 成员管理（超级管理员/分组管理员权限控制）
- `services/customer_service.py` — DeepSeek 生成客户分析 + 售前准备报告
- `services/allocation_service.py` — DeepSeek 生成 3 套资产配置方案
- `services/rag_service.py` — Chat 问答 + KB 检索工具函数
- `services/training_service.py` — DeepSeek 生成客户模拟 + 教练提示 + 复盘报告（KB-First）
- `services/fund_service.py` — 东方财富 API 获取真实基金净值走势
- `services/embedding_service.py` — ChromaDB 向量存储，支持分批嵌入
- `services/post_sales_service.py` — 音频转录（faster-whisper）+ 售后报告生成 + 通话摘要 + KB 匹配
- `services/realtime_asr.py` — 实时 ASR 流水线（Silero-VAD + faster-whisper large-v3-turbo + OpenCC 简繁转换）
- `services/speaker_clustering.py` — 在线说话人聚类（pyannote embedding + 增量余弦相似度匹配，最多 4 人）
- `services/trigger_engine.py` — 教练触发器引擎（8 条 YAML 规则 + DeepSeek 流式生成教练提示）
- `services/trigger_rules.yaml` — 触发器规则配置（犹豫/价格异议/竞品/承诺/反对/长静默/多人/情绪）
- `services/tts_service.py` — 语音合成服务（edge-tts，默认 zh-CN-XiaoxiaoNeural）
- `services/realtime_service.py` — 实时会话归档（完成后 bulk persist 到 PostgreSQL）
- `routers/realtime.py` — WebSocket 端点 /ws/realtime/session + HTTP GET 回放端点（使用 apply_user_filter，管理员可查看全部）
- `utils/auth.py` — JWT 生成/验证、bcrypt 密码哈希、认证依赖注入（含 require_admin/require_super_admin/分组管理员过滤）
- `utils/document_loader.py` — 多格式文档加载（PDF/DOCX/TXT/MD/PPTX）
- `models/user.py` — User ORM 模型（UUID PK, username, email, hashed_password, role）
- `models/training.py` — TrainingSession / TrainingMessage / TrainingReview ORM 模型
- `models/post_sales.py` — PostSalesSession / PostSalesMessage ORM 模型
- `models/feedback.py` — Feedback ORM 模型
- `models/group.py` — Group ORM 模型（UUID PK, name, description, admin_id FK→users, created_at）
- `models/realtime_session.py` — RealtimeSession / RealtimeSegment / RealtimeCoachEvent ORM 模型
- `models/quiz.py` — QuizSession / QuizQuestion / QuizAnswer ORM 模型
- `routers/quiz.py` — 知识库练习 API（生成题目/提交答案/列表/详情/删除）
- `services/quiz_service.py` — DeepSeek 根据知识库内容自动生成练习题
- `schemas/quiz.py` — 练习相关 Pydantic 模型
- `schemas/auth.py` — 认证相关 Pydantic 模型（UserRegister, UserLogin, UserResponse, TokenResponse）
- `schemas/instructor.py` — 讲师统计 Pydantic 模型
- `schemas/training.py` — 训练相关 Pydantic 请求/响应模型
- `schemas/post_sales.py` — 售后分析 Pydantic 模型
- `schemas/feedback.py` — 用户反馈 Pydantic 模型
- `schemas/group.py` — 分组管理 Pydantic 模型（GroupCreate, GroupUpdate, GroupResponse, GroupMemberResponse）

### 前端模块

- `pages/Login.tsx` — 登录页（GitHub-dark 风格卡片表单）
- `pages/Register.tsx` — 注册页（用户名 + 邮箱 + 密码 + 确认密码）
- `pages/Dashboard.tsx` — 首页仪表盘（8 统计卡片 + 3 模块入口 + 4 摘要卡片：仿真培训/实时语音/售后分析/知识库练习）
- `pages/KnowledgeBase.tsx` — 知识库管理（分类筛选 + 文档上传 + RAG 对话）
- `pages/CustomerAnalysis.tsx` — 客户列表 + 搜索 + 新建/删除
- `pages/Training.tsx` — 仿真培训主页面（会话列表 + 聊天区 + 复盘弹窗）
- `pages/InstructorDashboard.tsx` — 讲师端口统计面板（统计卡片 + 趋势图 + 用户表格 + CSV 导出）
- `components/Layout.tsx` — GitHub 风格侧边栏（含用户信息 + 讲师导航 + 退出登录）
- `components/ProtectedRoute.tsx` — 认证守卫（未登录重定向 /login）
- `components/CustomerProfile.tsx` — 客户详情（3 Tab：分析/售前准备/配置方案）+ 发起训练入口
- `components/AllocationPlan.tsx` — 3 套配置方案对比 + 手动调整 + 图表
- `components/ProductManager.tsx` — 产品库管理（CRUD + CSV 导入 + 分页 + 净值刷新）
- `components/ProductNavChart.tsx` — 产品净值走势图（基于 Recharts）
- `components/KycGrid.tsx` — 华兴银行高客 KYC 九宫格（严格数据映射 + 手动补填）
- `components/SessionList.tsx` — 训练记录侧边栏（会话列表 + 删除 + 复盘标记）
- `components/PersonaForm.tsx` — 手动创建数字人客户表单
- `components/TrainingSession.tsx` — 仿真训练聊天界面 + 教练实时提示 + 复盘弹窗
- `components/TrainingReview.tsx` — 复盘报告（评分/雷达图/话术点评/技能短板/建议 + PDF 导出）
- `components/PdfPreview.tsx` — PDF 预览（react-pdf canvas 渲染，支持缩放/翻页/自适应宽度）
- `components/QuizPanel.tsx` — 知识库练习面板（选择题 + 简答题 + 自动评分）
- `context/AuthContext.tsx` — 认证上下文（user 状态、login/register/logout、isInstructor、isAdmin）
- `pages/PostSalesAnalysis.tsx` — 售后分析主页面（会话列表 + 新建）
- `components/PostSalesSession.tsx` — 售后分析对话界面（录音/上传/手动输入/报告浮窗）
- `components/PostSalesReport.tsx` — 售后报告可视化（雷达图/情绪轨迹/仪表盘/时间线/PDF 导出）
- `pages/Feedback.tsx` — 用户反馈页（星级评分 + 评价记录展开查看 + 统计）
- `pages/AdminUsers.tsx` — 管理员用户管理（列表/角色修改/添加/删除）
- `pages/AdminFeedback.tsx` — 管理员反馈总览（全部反馈展开查看 + 统计）
- `pages/AdminGroups.tsx` — 分组管理（创建/编辑/删除分组 + 成员管理 + 权限控制）
- `pages/RealTimeVoice.tsx` — 实时语音陪跑主页面（转录面板 + 教练侧边栏 + 录音控制）
- `components/RealtimeTranscript.tsx` — 实时转录面板（说话人彩色标签 + 可折叠）
- `components/RealtimeCoach.tsx` — 实时教练提示侧边栏（打字机效果 + 钉住/自动消失）
- `hooks/useRealtimeASR.ts` — 实时 ASR Hook（MediaRecorder + WebSocket + 自动重连）
- `hooks/useVoiceInterrupt.ts` — 语音打断检测 Hook（AudioContext RMS 音量监测）
- `components/SessionSidebar.tsx` — 通用会话侧边栏组件
- `context/ThemeContext.tsx` — 主题切换上下文（暗色 + 奶油色 Light Mode）
- `hooks/useRealtimeASR.ts` — 实时语音识别 Hook（MediaRecorder + WebSocket + 自动重连）
- `hooks/useVoiceInterrupt.ts` — 语音打断检测 Hook（AudioContext RMS 音量监测，阈值 0.08）
- `components/RealtimeTranscript.tsx` — 实时转录面板（固定右下角，可折叠，说话人标签）
- `components/RealtimeCoach.tsx` — 实时教练提示浮窗（打字机效果，自动消失/钉住，历史 20 条）

### 用户分组系统

- **超级管理员**（role=admin, group_id=NULL）：管理所有分组和用户，创建/删除分组，分配分组管理员，修改角色
- **分组管理员**（role=admin, group_id=<group>，且为组的 admin_id）：仅管理自己分组的成员，查看组内用户和反馈
- `groups` 表：id, name (unique), description, admin_id (FK→users), created_at
- `users.group_id` (FK→groups, nullable)：用户所属分组
- 分组管理员登录后仅看到自己组的用户和反馈，`apply_user_filter` 按组隔离数据
- 端点：`POST/GET/PATCH/DELETE /api/groups` + `GET/POST/DELETE /api/groups/{id}/members/{user_id}`

### 仿真培训（AI 数字人对练）

- **两种创建方式**：从客户分析页一键发起（使用客户画像），或手动创建数字人画像
- **双 Agent 架构**：customer agent（t=0.7）模拟真实客户，coach agent（t=0.3）生成教练提示
- **教练提示 4 维度**：策略建议、话术矫正、销售金句、情绪感知 — 每条用户消息都触发
- **60 秒空闲检测**：输入框 60 秒无操作自动请求 LLM 生成回复思路建议
- **对话自然结束检测**：customer agent 判断对话是否已自然结束，提示用户生成复盘
- **实时持久化**：每条消息即时存入 PostgreSQL，导航离开再回来可继续未完成训练
- **结构化复盘报告**：评分（表达逻辑/专业准确度/情绪情商/综合）+ 雷达图 + 话术点评 + 技能短板 + 下一步建议
- **复盘持久化保存**：完成后左侧列表标记 📊，可随时回看历史复盘，支持导出 PDF
- **级联删除**：删除训练会话时自动清理所有关联的消息和复盘记录
- **会话恢复**：URL 参数 + sessionStorage 双重持久化，刷新/导航不丢失当前会话
- **端点**：`POST /sessions`（创建）、`GET /sessions`（列表）、`GET /sessions/{id}`（详情含消息和复盘）、`POST /sessions/{id}/messages`（发消息）、`POST /sessions/{id}/end`（结束并生成复盘）、`GET /sessions/{id}/review`（单独获取复盘）、`DELETE /sessions/{id}`（级联删除）

### KYC 九宫格

- 高净值客户（wealth_scale ≥ 7，资产约 >500 万）自动显示切换入口
- 严格从 `structured_data` + `ai_profile` 映射 9 个格子，不增添信息
- 信息缺失格子橙色标记 + 编辑角标，用户可手动补充
- 一键切换：AI 分析报告 ↔ KYC 九宫格
- `POST /api/customers/{id}/regenerate-profile` 重新生成 AI 画像

### 基金净值数据

- 基金产品填入 `fund_code` 后，创建/导入时自动从东方财富 API 拉取近 12 个月真实净值
- `POST /api/products/{id}/refresh-nav` 手动刷新，`GET /api/products/{id}` 超过 4 小时自动刷新
- 前端展开产品卡片时检测净值是否过期（>4h），过期自动调用后端刷新
- 非基金产品（保险/信托/理财）无公开净值数据，显示"未获得实时数据"提示

### 客户信息系统（Customer Info System）

- **structured_data 扩展为 50+ 字段**：六大类（基础身份/资产收支/负债/投资偏好/保险保障/生活服务）
- **客户信息卡片**（CustomerInfoCards）：分组卡片式展示，只显示有值字段，2-3 列响应式网格
- **客户详情浮窗**：点击客户卡片弹出居中毛玻璃浮窗，移动端和桌面端统一
- **Tab 重组**：客户信息（默认）→ AI 分析 → 售前准备 → 配置方案，药丸按钮样式
- **编辑资料弹窗**：六大类分组表单，所有字段可编辑，保存到 structured_data
- **CSV 批量导入**：`POST /api/customers/import-csv`，表头对应字段名
- **联系方式脱敏**：默认显示 `138****8888`，点击「查看」完整显示
- **AI 重新生成**：按钮移至 AI 分析 Tab 顶部，基于最新 structured_data 重新生成评分+画像+报告
- **regenerate-profile 修复**：无 raw_input 时自动从 structured_data 构建描述文本

### 产品详情浮窗

- 产品列表点击弹出居中浮窗，包含类型/风险/收益/净值走势等完整信息
- 不再使用内嵌展开卡片

### 配置方案环形图

- 配置方案改为浮窗弹窗展示，使用环形图（Donut Chart）可视化产品配比
- 右侧图例显示产品名+占比+金额+选择原因
- 支持手动调整配比（滑块+数值输入），实时校验总和 100%

### 银行 DISC 性格分类体系

- **客户分析 prompt**：集成 DISC 四型（支配型/影响型/稳健型/尽责型）+ 实战通俗分类（8 型）+ 金融属性分类（5 型）
- **新增 `personality_profile` 字段**：disc_type、practical_type、financial_type、personality_summary
- **售前准备 prompt**：DISC 定制化沟通策略（D 型给选择权、I 型拉关系、S 型讲安全、C 型摆数据）
- **培训客户 Agent**：DISC 性格扮演指南 + 真人化对话规则（语气词/情绪波动/前后不一致）
- **培训教练 Agent**：DISC 点评框架 + 6 型拒绝分析（真拒绝/信任不足/理解偏差/性格使然/谈判试探/情绪因素）
- **客户 Agent 拒绝系统**：区分客观原因（预算/时机/政策/家人）和主观原因（信任/不匹配/不适），模拟真实客户

### PDF 导出

- html2canvas (scale:3) + jsPDF，自动切换浅色主题（`.pdf-export`）
- 按 `data-pdf-section` 分块捕获，避免分页切断内容
- 操作按钮（导出/编辑/重新生成/KYC 切换）通过 `.pdf-hide` 在 PDF 中隐藏
- 高净值客户 PDF 自动包含 KYC 九宫格（插入在 AI 分析之后）
- 未生成的内容（如未生成的配置方案）不会出现在 PDF 中

### 用户认证与多租户

- **JWT 认证**：`python-jose[cryptography]` + HS256，纯 access token（24h 过期），无 refresh token
- **密码存储**：`bcrypt==4.2.1`（非 passlib，因兼容性问题）
- **三种角色**：admin（管理员，看全部数据）、instructor（讲师，看全部数据 + 讲师端口）、salesperson（销售，仅看自己的数据）
- **权限层级**：
  - **超级管理员**（role=admin, group_id=NULL）：管理所有用户/分组/反馈
  - **分组管理员**（role=admin, group_id=<group>，且是组的 admin_id）：仅管理自己组内用户
  - **普通用户**：仅看自己的数据
- **数据隔离**：Customer / Product / TrainingSession 添加 `user_id` 列（FK → users.id）
- **文档分层**：Document.user_id 可空 — NULL = 基础/共享文档全员可见，非 NULL = 个人文档
- **产品分层**：Product.user_id 可空 — 管理员创建的产品 user_id=NULL（共享），普通用户创建的仅自己可见
- **查询过滤**：
  - `apply_user_filter(query, model, current_user)` — 超级管理员看全部，分组管理员看组内数据，其他人仅看自己的（Customer / TrainingSession）
  - `apply_document_filter(query, model, current_user)` — admin 看全部，其他人看共享 + 自己的（Document / Product）
- **角色守卫**：`require_instructor(current_user)` 允许 admin + instructor，拒绝 salesperson；`require_super_admin(current_user)` 要求 role=admin 且 group_id=NULL
- **默认账号**：admin / admin123（Alembic 迁移自动创建）
- **Chat 隔离**：对话以 `user_id:conversation_id` 命名空间前缀存储

### 讲师端口

- **4 个 API 端点**（全部要求 instructor/admin 角色）：
  - `GET /api/instructor/statistics/overview` — 总计：用户数/会话数/完成率/平均分
  - `GET /api/instructor/statistics/per-user` — 按用户细分统计
  - `GET /api/instructor/statistics/trends?granularity=weekly|monthly` — 训练趋势
  - `GET /api/instructor/reports/export?format=csv` — CSV 报表导出
- **评分提取**：Python 侧 `r.scores.get("overall")` 而非 SQL JSONB cast（避免 PostgreSQL JSONB 操作符兼容问题）
- **前端**：4 张统计卡片 + Recharts BarChart/Line 组合趋势图 + 按用户表格 + CSV 导出按钮
- **路由守卫**：`router = APIRouter(dependencies=[Depends(require_instructor)])` 统一控制

### 知识库优先生成（KB-First）

所有 LLM 生成（客户分析、售前准备、资产配置）在调用 DeepSeek 前会先从 ChromaDB 检索相关知识库内容，注入 prompt 优先参考。检索失败或无匹配时静默回退到纯 LLM 生成。

## 技术栈

- **后端**: Python 3.11 + FastAPI + SQLAlchemy + PostgreSQL
- **认证**: JWT (python-jose) + bcrypt 4.2.1
- **前端**: React 19 + TypeScript + Vite + Tailwind CSS + Recharts
- **桌面应用**: Tauri v2（Windows MSI/NSIS 安装包）
- **实时通信**: FastAPI WebSocket（JWT token 认证）
- **VAD**: Silero-VAD ONNX（8kHz, 32ms 窗口）
- **ASR**: faster-whisper `large-v3-turbo`（CTranslate2, CPU INT8）
- **说话人分离**: pyannote.audio（embedding + diarization-3.1）
- **教练引擎**: YAML 规则配置 + DeepSeek 流式 API
- **TTS**: edge-tts（zh-CN-XiaoxiaoNeural）/ Web Speech API
- **向量存储**: ChromaDB（本地持久化）
- **Embedding**: Jina AI `jina-embeddings-v3`（OpenAI 兼容，免费额度 100 万 token/天）
- **LLM**: DeepSeek API（OpenAI 兼容客户端）
- **文档加载**: PyMuPDF (PDF)、Docx2txtLoader (DOCX)、TextLoader (TXT/MD)、UnstructuredPowerPointLoader (PPTX)

## 启动命令

**3 个服务缺一不可：**

| # | 服务 | 命令 | 端口 |
|---|------|------|------|
| 1 | PostgreSQL | 系统服务，需保持运行 | 5432 |
| 2 | Backend | `cd backend && uvicorn app.main:app --port 8000 --reload` | 8000 |
| 3 | Frontend | `cd frontend && npm run dev` | 5173 |

```bash
# 激活虚拟环境
source .venv/Scripts/activate

# 验证后端
curl http://localhost:8000/api/health
```

| 4 | Desktop App | `cd frontend && cargo tauri build` | — |

## 关键约束

- 需配置 Jina API Key（`JINA_API_KEY`），免费额度 100 万 token/天，否则知识库上传和 RAG 问答全部崩溃
- PostgreSQL 需提前创建 `ai_agent` 数据库
- DeepSeek API Key 通过环境变量或 `.env` 文件配置
- 文本分割：`chunk_size=512, overlap=100`，分隔符包含中文标点（`。！？；，`）
- Embedding 分批：每批 4 个 chunk，避免 embedding 模型的 token 上下文溢出
- 文档删除时同步清理 ChromaDB 向量（通过 filename 元数据匹配）
- 语音转录：ffmpeg（系统级）+ faster-whisper + pyannote.audio（需 `HUGGINGFACE_TOKEN`）+ OpenCC 简繁转换

### 主题系统（Light/Dark Mode）

- **ThemeContext**：`ThemeContext.tsx` 管理 dark/light 切换，通过 `<html class="light">` 切换 CSS 变量
- **暗色模式（默认）**：`:root` 定义 GitHub-dark 风格变量（`--bg-primary: #0d1117` 等）
- **亮色模式**：`html.light` 覆盖为暖奶油色调（`--bg-primary: #FFF8F0` 等）
- **切换控件**：Layout 侧边栏底部 segmented-control 按钮
- **CSS 变量覆盖范围**：背景（bg-primary/secondary/tertiary/overlay）、边框（border-default/subtle）、文字（text-primary/secondary/tertiary/placeholder）、强调色、按钮色、阴影

### 毛玻璃侧边栏系统（Frosted Glass Sidebar）

- **`.sidebar-glass` CSS 类**：统一管理所有侧边栏的毛玻璃效果
  - Dark mode：`color-mix(10% --bg-secondary)` + `backdrop-filter: blur(40px)` — 高透明度强模糊
  - Light mode：纯 `--bg-secondary` 实色 + 浅阴影 — 清晰可读
- **`.sidebar-toggle` CSS 类**：侧边栏展开/折叠按钮，半透明玻璃质感 + hover 加深动画
- **侧边栏统一规格**：宽度 `220px/240px`，标题栏 `bg-[var(--bg-secondary)]/40 backdrop-blur-md`，卡片 `rounded-xl border p-2.5 backdrop-blur-md`
- **5 个侧边栏全部统一**：主导航（Layout）、知识库问答（ChatPanel）、仿真培训（Training）、实时语音（RealTimeVoice+SessionSidebar）、售后分析（PostSalesAnalysis）
- **折叠行为**：收起时仅露 4px + `overflow-hidden` 裁剪，完全不显示侧边栏内容；展开按钮为浮动药丸形状贴在右边缘
- **遮罩层**：`bg-black/40 backdrop-blur-[2px]`，点击关闭
- **主内容区**：侧边栏展开时不平移（无 ml 偏移），覆盖在主内容上方
- **卡片 hover 动画**：`hover:shadow-lg hover:shadow-black/10` + `transition-all duration-200`
- **滚动条**：全局窄化 `4px`，滑块色 `--border-subtle`

### 客户分析浮窗（Customer Detail Modal）

- 客户详情从内嵌右侧卡片改为居中毛玻璃浮窗（`max-w-3xl`, `max-h-[90vh]`）
- 背景遮罩 `bg-black/40 backdrop-blur-[2px]`，点击关闭
- 浮窗底色 `bg-[var(--bg-secondary)]`，头身分离（标题栏 + 可滚动内容区）
- 移动端和桌面端统一使用浮窗，不再区分

### 实时 ASR 优化（Realtime ASR）

- **去临时文件 I/O**：VAD 片段直接传 numpy float32 数组给 faster-whisper，消除 WAV 文件写入/读取延迟
- **ASR 参数调优**：`beam_size=3`, `best_of=3`, `repetition_penalty=1.2`
- **VAD 参数**：`threshold=0.5`, `min_speech_duration_ms=1000`, `max_speech_duration_s=8.0`
- **说话人聚类**：`similarity_threshold=0.40`（降低分裂），`max_speakers=4`
- **角色分配**：按检测顺序分配（speaker_0=销售, speaker_1+=客户），非按发言频次
- **前端标签**：`getSpeakerLabel()` 映射 speaker→讲话人/销售/客户/系统

## 售后分析（Post-Sales Analysis）— 含语音转录

- **创建方式**：从客户分析页一键发起（带 customerId），或从售后分析页独立创建
- **录音功能**：支持在 app 内直接录制（MediaRecorder API → `.webm`）、上传音频文件、手动输入对话
- **音频转录**：ffmpeg 转 16kHz WAV → faster-whisper `large-v3-turbo` 模型自动转录（中英文）
- **对话记录**：转录结果按 segments 分条展示，区分销售/客户/系统角色
- **客户关联**：`PATCH /sessions/{id}` 支持关联/解除客户，session 左侧列表实时更新
- **报告浮窗**：结束通话后 AI 分析报告以浮窗弹窗展示（html2canvas + jsPDF 导出），不替换对话视图
- **端点**：7 端点 — POST/GET/PATCH/DELETE sessions，POST messages，POST audio，POST end
- **报告内容**：综合评分 + 通话摘要 + 情绪轨迹图 + 对话占比饼图 + 能力评估雷达图 + 成交概率仪表盘 + 关键时刻时间线 + 错失机会 + 优势/待改进 + 知识库匹配

### 语音转录（Audio Transcription）

- **前端录制**：MediaRecorder API 录制 `audio/webm` 格式，支持实时录制和文件上传两种方式
- **后端处理**：`post_sales_service.transcribe_audio()` — ffmpeg 转 16kHz 单声道 WAV → faster-whisper `large-v3-turbo` (CPU int8) 转录
- **简繁转换**：OpenCC `t2s` 自动将转录文本从繁体转简体中文
- **存储路径**：音频文件保存在 `audio_uploads/` 目录，上传后立即转录并存入 PostgreSQL
- **错误处理**：转录失败不阻塞流程，用户仍可手动输入对话内容
- **✅ 说话人分离（Speaker Diarization）** — pyannote.audio `speaker-diarization-3.1` 自动识别 2-4 个说话人，按发言时长排序映射为 销售/客户/其他。需配置 `HUGGINGFACE_TOKEN`，未配置时回退到无分离模式

## 实时语音陪跑（Real-time Voice AI）— 四阶段实现

### 概览

实时语音陪跑系统通过 WebSocket 连接实现低延迟 ASR 转录 + AI 教练实时提示 + TTS 语音反馈的完整闭环。

- **Phase 1**：实时 ASR 流水线（Silero-VAD + faster-whisper + OpenCC）
- **Phase 2**：多说话人分离（pyannote embedding + 在线聚类）
- **Phase 3**：AI 教练触发器引擎（YAML 规则 + DeepSeek 流式生成）
- **Phase 4**：TTS 语音合成 + 语音打断 + 会话归档

### 架构

```
浏览器 (MediaRecorder) ──WebSocket 二进制音频──▶ FastAPI /ws/realtime/session
                                                      │
                                   ┌──────────────────┼──────────────────┐
                                   ▼                  ▼                  ▼
                              Silero-VAD         Speaker             Trigger
                              (8kHz, 32ms)       Clustering          Engine
                                   │             (cosine≥0.45)       (8 rules)
                                   ▼                  │                  │
                              faster-whisper         │                  │
                              large-v3-turbo          │                  │
                              (INT8 CPU)             │                  │
                                   │                  │                  │
                                   └──────────────────┴──────────────────┘
                                                      │
                                   ◀── JSON transcript / coach_tip ──▶ 浏览器
                                                      │
                                   TTS ◀── edge-tts ──┘  (zh-CN-XiaoxiaoNeural)
```

### ASR 流水线

- **VAD**：Silero-VAD ONNX 模型，8kHz 采样率，32ms 原生窗口，threshold=0.5，min_speech_duration=500ms，max_speech_duration=10s
- **ASR**：faster-whisper `large-v3-turbo`（809M 参数），CTranslate2 加速，CPU INT8 量化
- **后处理**：OpenCC `t2s` 繁→简转换
- **VAD 坐标修复**：`_trim_audio_buffer` 使用 `end_vad - _current_sample` 而非绝对 `end_vad`

### 说话人聚类

- **SpeakerEmbedder**：pyannote/embedding 模型（512 维向量），LRU 缓存 200 条
- **OnlineSpeakerClustering**：增量余弦相似度匹配，threshold=0.45，max_speakers=4
- **质心更新**：EMA 指数移动平均 (alpha=0.3) + L2 归一化
- **短片段过滤**：min_segment_duration_ms=1000，低于阈值的片段归入上一个说话人
- **角色映射**：按发言频次自动分配 销售/客户/其他 角色标签
- **回退**：无 HF token 时使用随机 embedding

### 教练触发器引擎

- **8 条 YAML 规则**：hesitation（犹豫）、price_objection（价格异议）、competitor_mention（竞品提及）、commitment_signal（承诺信号）、objection（反对）、long_silence（长静默 60s）、multi_party（多人讨论）、emotional_shift（情绪转变）
- **每条规则**：id、condition、pattern（regex）、action、priority、cooldown（秒）
- **CoachPromptBuilder**：7 种 action 专用中文 prompt 模板，DeepSeek 流式生成（t=0.3, max_tokens=512）
- **Cooldown 追踪**：`{rule_id: last_trigger_time}` 字典

### TTS + 打断

- **TTS**：edge-tts（免费 Microsoft Edge TTS），默认语音 `zh-CN-XiaoxiaoNeural`，支持 `synthesize()` / `synthesize_stream()` / `synthesize_base64()`
- **语音打断**：AudioContext + AnalyserNode RMS 音量监测，threshold=0.08，sustainedMs=200，intervalMs=50
- **打断信号**：WebSocket 发送 `{"type": "interrupt"}` JSON 消息

### 前端组件

- **useRealtimeASR**：MediaRecorder 录音（audio/webm;codecs=opus，100ms 分片），WebSocket 连接管理，自动重连（3 次，指数退避 1s/2s/4s）
- **RealtimeTranscript**：中部转录面板，可折叠，红色录音脉冲点，说话人彩色标签（销售=绿色、客户=蓝色、其他=紫色）
- **RealtimeCoach**：右侧固定侧边栏（w-[320px]），打字机效果（~25ms 间隔），7 种触发器类型颜色，8 个中文标签，自动消失（10s）+ 钉住，历史 20 条，绿色 "LIVE" 连接按钮
- **实验入口**：Training.tsx 右上角 "实验：实时语音" 按钮

### 数据持久化

- **RealtimeSession**：id, user_id, status (active/completed/abandoned), speaker_count, started_at, ended_at
- **RealtimeSegment**：id, session_id (FK CASCADE), start, end, text, speaker, confidence, asr_model
- **RealtimeCoachEvent**：id, session_id (FK CASCADE), trigger_rule, coach_content, segment_id (FK SET NULL)
- **归档**：`archive_session()` 在 WebSocket 断开后 bulk persist，`GET /api/realtime/sessions/{id}` 回放历史

### KB 优先原则

所有 LLM 生成（客户分析、售前准备、资产配置、培训教练、快速回复、复盘、售后报告、通话摘要）统一遵循：

- 优先基于 ChromaDB 知识库检索内容进行分析和建议
- 知识库支撑的内容标注 **📚** 或 **📚基于知识库**
- 知识库未覆盖、AI 自行推断的内容标注 **💡AI分析**
- 严禁编造知识库中不存在的信息
