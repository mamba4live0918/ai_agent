# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目目标

构建"陪跑助手 + 仿真培训"双核心场景的销售辅助平台：

**陪跑助手** — 覆盖售前/售中/售后的全流程销售辅助系统：
- 客户分析：导入客户信息（文字/图片），画像分析，信息存档查询，导出电子文档
- 资产配置方案：导入金融产品信息，联网搜索产品详情，生成配置方案，导出文档
- 售前准备：基于客户生命周期生成营销建议（潜在难点、应对话术、心态准备、维护动作），支持仿真培训预演
- 售中辅助：记录销售过程，（后续：实时语音识别客户情绪/意向/问题，提供应对话术/避坑建议/促销策略）
- 售后分析：生成客户销售档案（分类/查询/萃取/删除），导出电子表格，给出评价与行动建议
- 销售辅助知识库：财经法税知识、沟通技巧、行业知识、销售案例等（图文/短视频）
- 30秒客户宣教视频生成及分发
- 用户激励：评价、反馈、分享

**仿真培训** — AI数字人对练系统：
- AI数字人客户：根据客户信息自动生成合适的数字人画像（年龄/性别/职业/性格等），沉浸式语音对话模拟不同销售场景（客诉处理、产品讲解、异议处理）
- AI数字人教练：实时提供策略建议、话术矫正、销售金句，复盘点评表达逻辑/专业准确度/情绪情商，记录训练过程并归档
- 预留讲师端口：统计训练结果，导出报表，学练考评闭环

**终端支持**：PC端 + 移动端双端访问
**当前开发阶段**：文字交互优先，语音功能暂不处理

## 当前状态

项目已拆分为正式的前后端架构。`main.py` 是早期的 RAG 原型（Gradio），保留作为技术参考。

### 项目结构

```
backend/     FastAPI (port 8000)
frontend/    React 19 + TypeScript + Vite (port 5173)
```

### 后端模块

- `routers/knowledge.py` — 知识库 CRUD（分类 + 文档上传/删除）
- `routers/customer.py` — 客户 CRUD + 分析 + 售前准备 + 配置方案 + 画像重新生成
- `routers/product.py` — 产品库 CRUD + CSV 批量导入 + 净值自动刷新
- `routers/chat.py` — 知识库 RAG 问答
- `routers/training.py` — 仿真培训 API（7 端点：创建/列表/详情/发消息/结束/复盘/删除）
- `services/customer_service.py` — DeepSeek 生成客户分析 + 售前准备报告
- `services/allocation_service.py` — DeepSeek 生成 3 套资产配置方案
- `services/rag_service.py` — Chat 问答 + KB 检索工具函数
- `services/training_service.py` — DeepSeek 生成客户模拟 + 教练提示 + 复盘报告（KB-First）
- `services/fund_service.py` — 东方财富 API 获取真实基金净值走势
- `services/embedding_service.py` — ChromaDB 向量存储，支持分批嵌入
- `utils/document_loader.py` — 多格式文档加载（PDF/DOCX/TXT/MD/PPTX）
- `models/training.py` — TrainingSession / TrainingMessage / TrainingReview ORM 模型
- `schemas/training.py` — 训练相关 Pydantic 请求/响应模型

### 前端模块

- `pages/KnowledgeBase.tsx` — 知识库管理（分类筛选 + 文档上传 + RAG 对话）
- `pages/CustomerAnalysis.tsx` — 客户列表 + 搜索 + 新建/删除
- `pages/Dashboard.tsx` — 首页仪表盘
- `pages/Training.tsx` — 仿真培训主页面（会话列表 + 聊天区 + 复盘弹窗）
- `components/CustomerProfile.tsx` — 客户详情（3 Tab：分析/售前准备/配置方案）+ 发起训练入口
- `components/AllocationPlan.tsx` — 3 套配置方案对比 + 手动调整 + 图表
- `components/ProductManager.tsx` — 产品库管理（CRUD + CSV 导入 + 分页 + 净值刷新）
- `components/ProductNavChart.tsx` — 产品净值走势图（基于 Recharts）
- `components/KycGrid.tsx` — 华兴银行高客 KYC 九宫格（严格数据映射 + 手动补填）
- `components/SessionList.tsx` — 训练记录侧边栏（会话列表 + 删除 + 复盘标记）
- `components/PersonaForm.tsx` — 手动创建数字人客户表单
- `components/TrainingSession.tsx` — 仿真训练聊天界面 + 教练实时提示 + 复盘弹窗
- `components/TrainingReview.tsx` — 复盘报告（评分/雷达图/话术点评/技能短板/建议 + PDF 导出）

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

### 知识库优先生成（KB-First）

所有 LLM 生成（客户分析、售前准备、资产配置）在调用 DeepSeek 前会先从 ChromaDB 检索相关知识库内容，注入 prompt 优先参考。检索失败或无匹配时静默回退到纯 LLM 生成。

## 技术栈

- **后端**: Python 3.11 + FastAPI + SQLAlchemy + PostgreSQL
- **前端**: React 19 + TypeScript + Vite + Tailwind CSS + Recharts
- **向量存储**: ChromaDB（本地持久化）
- **Embedding**: Ollama `nomic-embed-text`
- **LLM**: DeepSeek API（`deepseek-reasoner`，OpenAI 兼容客户端）
- **文档加载**: PyMuPDF (PDF)、Docx2txtLoader (DOCX)、TextLoader (TXT/MD)、UnstructuredPowerPointLoader (PPTX)

## 启动命令

**4 个服务缺一不可：**

| # | 服务 | 命令 | 端口 |
|---|------|------|------|
| 1 | PostgreSQL | 系统服务，需保持运行 | 5432 |
| 2 | Ollama | `ollama serve`（或系统托盘启动） | 11434 |
| 3 | Backend | `cd backend && uvicorn app.main:app --port 8000 --reload` | 8000 |
| 4 | Frontend | `cd frontend && npm run dev` | 5173 |

```bash
# 激活虚拟环境
source .venv/Scripts/activate

# 验证 Ollama（需要 nomic-embed-text 模型）
curl http://localhost:11434/api/tags

# 验证后端
curl http://localhost:8000/api/health
```

## 关键约束

- Ollama 必须运行且已拉取 `nomic-embed-text`，否则知识库上传和 RAG 问答全部崩溃
- PostgreSQL 需提前创建 `ai_agent` 数据库
- DeepSeek API Key 通过环境变量或 `.env` 文件配置
- 文本分割：`chunk_size=512, overlap=100`，分隔符包含中文标点（`。！？；，`）
- Embedding 分批：每批 4 个 chunk，避免 `nomic-embed-text` 的 8192 token 上下文溢出
- 文档删除时同步清理 ChromaDB 向量（通过 filename 元数据匹配）
