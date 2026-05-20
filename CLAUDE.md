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
- `routers/customer.py` — 客户 CRUD + 分析 + 售前准备 + 配置方案
- `routers/product.py` — 产品库 CRUD + CSV 批量导入
- `routers/chat.py` — 知识库 RAG 问答
- `services/customer_service.py` — DeepSeek 生成客户分析 + 售前准备报告
- `services/allocation_service.py` — DeepSeek 生成 3 套资产配置方案
- `services/rag_service.py` — Chat 问答 + KB 检索工具函数
- `services/embedding_service.py` — ChromaDB 向量存储，支持分批嵌入
- `utils/document_loader.py` — 多格式文档加载（PDF/DOCX/TXT/MD/PPTX）

### 前端模块

- `pages/KnowledgeBase.tsx` — 知识库管理（分类筛选 + 文档上传 + RAG 对话）
- `pages/CustomerAnalysis.tsx` — 客户列表 + 搜索 + 新建/删除
- `pages/Dashboard.tsx` — 首页仪表盘
- `components/CustomerProfile.tsx` — 客户详情（3 Tab：分析/售前准备/配置方案）
- `components/AllocationPlan.tsx` — 3 套配置方案对比 + 手动调整 + 图表
- `components/ProductManager.tsx` — 产品库管理（CRUD + CSV 导入 + 分页）

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

# 初始化产品种子数据（首次运行或重置时）
cd backend && python seed_products.py
```

## 关键约束

- Ollama 必须运行且已拉取 `nomic-embed-text`，否则知识库上传和 RAG 问答全部崩溃
- PostgreSQL 需提前创建 `ai_agent` 数据库
- DeepSeek API Key 通过环境变量或 `.env` 文件配置
- 文本分割：`chunk_size=512, overlap=100`，分隔符包含中文标点（`。！？；，`）
- Embedding 分批：每批 4 个 chunk，避免 `nomic-embed-text` 的 8192 token 上下文溢出
- 文档删除时同步清理 ChromaDB 向量（通过 filename 元数据匹配）
