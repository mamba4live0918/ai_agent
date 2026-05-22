# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目目标

构建"陪跑助手 + 仿真培训"双核心场景的销售辅助平台：

**陪跑助手** — 覆盖售前/售中/售后的全流程销售辅助系统：
- 客户分析：导入客户信息（文字/图片），画像分析，信息存档查询，导出电子文档
- 资产配置方案：导入金融产品信息，联网搜索产品详情，生成配置方案，导出文档
- 售前准备：基于客户生命周期生成营销建议（潜在难点、应对话术、心态准备、维护动作），支持仿真培训预演
- 售中辅助：语音录制上传、说话人分离（pyannote）、语音转录（faster-whisper large-v3）、AI 情绪/意图/建议分析，对话记录与回放
- 售后分析：生成客户销售档案（分类/查询/萃取/删除），导出电子表格，给出评价与行动建议
- 销售辅助知识库：财经法税知识、沟通技巧、行业知识、销售案例等（图文/短视频）
- 30秒客户宣教视频生成及分发
- 用户激励：评价、反馈、分享

**仿真培训** — AI数字人对练系统：
- AI数字人客户：根据客户信息自动生成合适的数字人画像（年龄/性别/职业/性格等），沉浸式语音对话模拟不同销售场景（客诉处理、产品讲解、异议处理）
- AI数字人教练：实时提供策略建议、话术矫正、销售金句，复盘点评表达逻辑/专业准确度/情绪情商，记录训练过程并归档
- 预留讲师端口：统计训练结果，导出报表，学练考评闭环

**终端支持**：PC端 + 移动端双端访问
**当前开发阶段**：文字交互 + 语音转录已完成，实时转录规划中

## 当前状态

项目已拆分为正式的前后端架构。`main.py` 是早期的 RAG 原型（Gradio），保留作为技术参考。

### 项目结构

```
backend/     FastAPI (port 8000)
frontend/    React 19 + TypeScript + Vite (port 5173)
```

### 后端模块

- `routers/auth.py` — 用户注册/登录/退出/获取当前用户（JWT + bcrypt，密码复杂度，账号锁定）
- `routers/knowledge.py` — 知识库 CRUD（分类 + 文档上传/删除），文档按用户隔离
- `routers/customer.py` — 客户 CRUD + 分析 + 售前准备 + 配置方案 + 画像重新生成
- `routers/product.py` — 产品库 CRUD + CSV 批量导入 + 净值自动刷新
- `routers/chat.py` — 知识库 RAG 问答，对话按用户命名空间隔离
- `routers/training.py` — 仿真培训 API（7 端点：创建/列表/详情/发消息/结束/复盘/删除）
- `routers/sales_assistance.py` — 售中辅助 API（6 端点：上传/列表/详情/处理/分析/删除）
- `routers/instructor.py` — 讲师端口（统计概览/按用户统计/训练趋势/CSV 导出）
- `services/customer_service.py` — DeepSeek 生成客户分析 + 售前准备报告
- `services/allocation_service.py` — DeepSeek 生成 3 套资产配置方案
- `services/rag_service.py` — Chat 问答 + KB 检索工具函数
- `services/training_service.py` — DeepSeek 生成客户模拟 + 教练提示 + 复盘报告（KB-First）
- `services/voice_processor.py` — 语音处理器抽象层（Protocol），工厂函数 get_voice_processor()
- `services/local_voice_processor.py` — 本地语音处理：pyannote 说话人分离 + faster-whisper large-v3 转录
- `services/cloud_voice_processor.py` — 云端语音处理占位（预留阿里云/讯飞）
- `services/voice_service.py` — 语音文件保存 + 处理 pipeline 编排（webm→wav 转换 + 转录 + 分析）
- `services/sales_assistance_service.py` — LLM 销售辅助分析（3 模块：情绪/意图/建议，KB-First）
- `services/fund_service.py` — 东方财富 API 获取真实基金净值走势
- `services/embedding_service.py` — ChromaDB 向量存储，支持分批嵌入
- `utils/auth.py` — JWT 生成/验证(JTI)、bcrypt 密码哈希、Token 黑名单、认证依赖注入、用户/文档过滤
- `utils/document_loader.py` — 多格式文档加载（PDF/DOCX/TXT/MD/PPTX），自动解密加密文件
- `utils/crypto.py` — AES-256-GCM 加解密工具（文件 + 字段级）
- `middleware/rate_limit.py` — 纯 ASGI 内存滑动窗口限流中间件
- `middleware/security_headers.py` — 安全响应头中间件（HSTS/CSP/X-Frame-Options 等）
- `models/user.py` — User ORM 模型（含 failed_login_attempts, locked_until 锁定字段）
- `models/token_blacklist.py` — Token 黑名单 ORM 模型（按 JTI 索引）
- `models/training.py` — TrainingSession / TrainingMessage / TrainingReview ORM 模型
- `models/sales_conversation.py` — SalesConversation / ConversationMessage ORM 模型（售中辅助）
- `schemas/auth.py` — 认证相关 Pydantic 模型（含密码复杂度 field_validator）
- `schemas/instructor.py` — 讲师统计 Pydantic 模型
- `schemas/training.py` — 训练相关 Pydantic 请求/响应模型
- `schemas/sales_assistance.py` — 售中辅助 Pydantic 模型

### 前端模块

- `pages/Login.tsx` — 登录页（GitHub-dark 风格卡片表单）
- `pages/Register.tsx` — 注册页（用户名 + 邮箱 + 密码 + 确认密码）
- `pages/Dashboard.tsx` — 首页仪表盘
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
- `components/VoiceRecorder.tsx` — 语音录制（MediaRecorder API，录制/停止/上传状态机）
- `components/ConversationViewer.tsx` — 对话回放（双栏布局：转录对话 + 分析面板）
- `components/AnalysisPanel.tsx` — AI 分析面板（3 Tab：情绪/意图/建议）
- `pages/SalesAssistance.tsx` — 售中辅助主页（268px 会话列表 + 录制入口/对话查看器）
- `context/AuthContext.tsx` — 认证上下文（user 状态、login/register/logout、isInstructor）

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

### 售中辅助（语音转录 + AI 分析）

- **语音录制**：前端 MediaRecorder API，audio/webm 格式上传
- **格式转换**：pydub (ffmpeg) webm→WAV 转换，解决 torchcodec 在 Windows 上的 webm duration 读取问题
- **说话人分离**：pyannote-audio 4.0.4（speaker-diarization-3.1），自动区分 SPEAKER_00/01
- **说话人映射**：启发式规则（首个发言 + 总时长最长 → 销售，另一个 → 客户）
- **语音转录**：faster-whisper large-v3（CPU），中文优化，word-level timestamps 对齐
- **np.float64 兼容**：faster-whisper 返回 numpy 类型，需显式 float() 转换后落库（否则 PostgreSQL 报 "schema np does not exist"）
- **AI 分析 3 模块**（DeepSeek + KB-First RAG）：
  - 情绪分析：整体情感倾向、客户情绪时间线、转折点、销售能量曲线
  - 意图识别：客户意图（比价/顾虑/购买意向）、购买信号、风险信号
  - 销售建议：错失机会、后续行动（按优先级）、话术要点、下次会面准备
- **数据模型**：`sales_conversations` + `conversation_messages`（JSONB transcription_segments + analysis_results）
- **前端**：VoiceRecorder 录制组件 + ConversationViewer 双栏回放 + AnalysisPanel 3 Tab 分析面板
- **6 个 API 端点**：`POST /conversations`（上传）、`GET /conversations`（列表）、`GET /conversations/{id}`（详情）、`POST /conversations/{id}/process`（触发处理）、`GET /conversations/{id}/analysis`（分析结果）、`DELETE /conversations/{id}`（级联删除）
- **语音处理器抽象**：Python Protocol 实现，`voice_processor_mode` 配置切换 local/cloud，预留云端 API 接入

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

### 基本信息九宫格编辑器

- 所有客户（非仅高净值）在客户分析页显示可编辑的 3×3 基本信息九宫格
- 9 个字段：年龄、性别、职业、收入水平、资产状况、风险偏好、投资经验、家庭状况、理财目标
- 每个格子可独立编辑（✎ 按钮），保存到 `structured_data`
- 信息不足的格子留空显示 "—"，不强制补填
- 重新生成时，人工编辑的 `structured_data` 随请求发给 AI，prompt 中标注为"最高优先级"，AI 严格采用不再推断
- 端点：`PUT /api/customers/{id}` 保存编辑，`POST /api/customers/{id}/regenerate-profile` 可携带 `structured_data`

### PDF 导出

- html2canvas (scale:3) + jsPDF，自动切换浅色主题（`.pdf-export`）
- 按 `data-pdf-section` 分块捕获，避免分页切断内容
- 操作按钮（导出/编辑/重新生成/KYC 切换）通过 `.pdf-hide` 在 PDF 中隐藏
- 高净值客户 PDF 自动包含 KYC 九宫格（插入在 AI 分析之后）
- 未生成的内容（如未生成的配置方案）不会出现在 PDF 中

### 用户认证与多租户

- **JWT 认证**：`python-jose[cryptography]` + HS256，access token 24h 过期，含 JTI 用于吊销，无 refresh token
- **密码策略**：最少 8 位，必须含字母和数字（Pydantic field_validator）
- **账号保护**：5 次登录失败锁定 15 分钟，登录成功自动重置计数
- **Token 吊销**：`POST /api/auth/logout` 将 token 的 JTI 加入黑名单，下次请求即失效
- **密码存储**：`bcrypt==4.2.1`（非 passlib，因兼容性问题）
- **三种角色**：admin（管理员，看全部数据）、instructor（讲师，看全部数据 + 讲师端口）、salesperson（销售，仅看自己的数据）
- **数据隔离**：Customer / Product / TrainingSession 添加 `user_id` 列（FK → users.id）
- **文档分层**：Document.user_id 可空 — NULL = 基础/共享文档全员可见，非 NULL = 个人文档
- **产品分层**：Product.user_id 可空 — 管理员创建的产品 user_id=NULL（共享），普通用户创建的仅自己可见
- **查询过滤**：
  - `apply_user_filter(query, model, current_user)` — admin 看全部，其他人仅看自己的（Customer / TrainingSession）
  - `apply_document_filter(query, model, current_user)` — admin 看全部，其他人看共享 + 自己的（Document / Product）
- **角色守卫**：`require_instructor(current_user)` 允许 admin + instructor，拒绝 salesperson
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

### 安全加固

- **ChromaDB 检索隔离**：向量检索按 `user_id` 过滤（共享文档 + 用户自有文档），防止跨用户数据泄露
- **JWT 密钥保护**：启动时检测 secret_key 是否为默认值，自动生成随机密钥并 WARNING 提示
- **审计日志**：`audit_logs` 表（append-only）记录登录尝试、文档上传/删除、客户创建/删除等关键操作，含 IP 地址
- **速率限制**：纯 ASGI 内存限流中间件，登录 5次/分钟/IP，全局 API 60次/分钟/IP
- **文件加密**：上传文件 AES-256-GCM 加密存储（ENC1 魔数头），文档加载器自动解密
- **客户数据加密**：`raw_input` 字段 AES-256-GCM 加密落库，API 边界加解密
- **密码复杂度**：最少 8 位，必须包含字母和数字（Pydantic field_validator）
- **账号锁定**：5 次登录失败后锁定 15 分钟，登录成功自动重置
- **Token 黑名单**：退出登录将当前 token 加入黑名单（按 JTI），`get_current_user` 检查黑名单
- **安全响应头**：HSTS / CSP / X-Frame-Options / X-Content-Type-Options / X-XSS-Protection / Referrer-Policy / Permissions-Policy
- **CORS 白名单**：methods 和 headers 限制为白名单（不再使用 `*`）
- **请求体大小限制**：50MB，防止大文件 DoS
- **Re-index 脚本**：`backend/scripts/reindex_chroma.py`，ChromaDB 元数据迁移后执行一次性重索引

## 技术栈

- **后端**: Python 3.11 + FastAPI + SQLAlchemy + PostgreSQL
- **认证**: JWT (python-jose) + bcrypt 4.2.1，密码复杂度策略，账号锁定，Token 黑名单
- **前端**: React 19 + TypeScript + Vite + Tailwind CSS + Recharts
- **向量存储**: ChromaDB（本地持久化）
- **Embedding**: Jina AI `jina-embeddings-v3`（OpenAI 兼容，免费额度 100 万 token/天）
- **语音处理**: pyannote-audio 4.0.4（说话人分离）+ faster-whisper large-v3（语音转录）+ pydub/ffmpeg（音频格式转换）
- **LLM**: DeepSeek API（`deepseek-reasoner`，OpenAI 兼容客户端）
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

## 关键约束

- 需配置 Jina API Key（`JINA_API_KEY`），免费额度 100 万 token/天，否则知识库上传和 RAG 问答全部崩溃
- PostgreSQL 需提前创建 `ai_agent` 数据库
- DeepSeek API Key 通过环境变量或 `.env` 文件配置
- 文本分割：`chunk_size=512, overlap=100`，分隔符包含中文标点（`。！？；，`）
- Embedding 分批：每批 4 个 chunk，避免 embedding 模型的 token 上下文溢出
- 文档删除时同步清理 ChromaDB 向量（通过 filename 元数据匹配）
- FFmpeg 共享 DLL 需放在 torchcodec 包目录下（avcodec-62.dll 等），否则 pyannote 无法加载音频文件
- HuggingFace 访问：国内需 `HF_ENDPOINT=https://hf-mirror.com`，VPN 环境留空即可直连官方源
- pyannote 说话人分离模型需 HuggingFace token（`HF_AUTH_TOKEN`），用于访问 gated model
- faster-whisper 返回 numpy 类型，写入 PostgreSQL 前需 float() 转换
