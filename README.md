# AI 销售助手 — 陪跑助手 + 仿真培训

AI 驱动的销售全流程辅助平台，覆盖售前/售中/售后完整链路，包含知识库 RAG 问答、客户画像分析、资产配置建议等核心功能。

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端框架** | FastAPI (Python 3.11) |
| **数据库** | PostgreSQL (结构化数据) + ChromaDB (向量存储) |
| **ORM** | SQLAlchemy + Alembic (迁移) |
| **LLM** | DeepSeek (`deepseek-reasoner`) |
| **Embedding** | Ollama (`nomic-embed-text`) |
| **文档处理** | LangChain (PDF/DOCX/TXT/MD/PPTX) |
| **前端** | React 19 + TypeScript + Vite + Tailwind CSS 3 + Recharts |

## 项目结构

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口，CORS，路由注册
│   │   ├── config.py            # 环境变量配置
│   │   ├── database.py          # SQLAlchemy engine + session
│   │   ├── models/              # ORM 模型
│   │   │   ├── knowledge.py     # Category, Document
│   │   │   └── customer.py      # Customer
│   │   ├── schemas/             # Pydantic 请求/响应
│   │   ├── routers/             # API 路由
│   │   │   ├── knowledge.py     # 知识库 CRUD + 文档上传
│   │   │   ├── customer.py      # 客户 CRUD + AI 分析
│   │   │   └── chat.py          # RAG 问答
│   │   ├── services/
│   │   │   ├── rag_service.py   # DeepSeek 推理 + 对话管理
│   │   │   ├── embedding_service.py  # ChromaDB 索引
│   │   │   └── customer_service.py   # 客户 AI 画像生成
│   │   └── utils/
│   │       └── document_loader.py    # LangChain 文档加载
│   ├── alembic/                 # 数据库迁移
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # 路由配置
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # 首页统计
│   │   │   ├── KnowledgeBase.tsx    # 知识库浏览/搜索/上传
│   │   │   └── CustomerAnalysis.tsx # 客户分析与画像
│   │   ├── components/
│   │   │   ├── Layout.tsx       # GitHub 风格侧边栏布局
│   │   │   ├── ChatPanel.tsx    # RAG 问答面板
│   │   │   ├── CustomerForm.tsx # 客户录入 (自由文本/表单)
│   │   │   ├── CustomerProfile.tsx   # AI 画像展示
│   │   │   ├── CategoryNav.tsx  # 分类导航
│   │   │   ├── DocumentUpload.tsx    # 文档上传
│   │   │   └── SearchBar.tsx    # 搜索栏
│   │   ├── services/api.ts      # API 调用封装
│   │   └── types/index.ts       # TypeScript 类型定义
│   ├── tailwind.config.js       # GitHub Primer 暗色主题配置
│   └── package.json
├── documents/                   # 原始文档 (原型用)
├── main.py                      # 原始 Gradio RAG 原型 (保留参考)
├── .env.example                 # 环境变量模板
└── CLAUDE.md                    # 项目开发指南
```

## 快速开始

### 前置条件

- **Python 3.11** + 虚拟环境
- **PostgreSQL** (默认 `localhost:5432`，数据库 `ai_agent`)
- **Ollama** (已拉取 `nomic-embed-text` 模型)
- **Node.js** 18+

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

### 4. 种子数据

首次启动后，后端会自动创建 4 个知识分类：
- 财经法税 / 沟通技巧 / 行业知识 / 销售案例

## API 端点

### 知识库
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/knowledge/categories` | 分类列表 (含文档数) |
| POST | `/api/knowledge/categories` | 创建分类 |
| GET | `/api/knowledge/documents` | 文档列表 `?category_id=&q=` |
| POST | `/api/knowledge/documents` | 上传文档 (multipart) |
| GET | `/api/knowledge/documents/{id}` | 文档详情 |
| DELETE | `/api/knowledge/documents/{id}` | 删除文档 |

### 客户分析
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/customers` | 客户列表 `?q=` |
| POST | `/api/customers` | 创建客户 |
| POST | `/api/customers/analyze` | AI 分析预览 (不保存) |
| GET | `/api/customers/{id}` | 客户详情 + AI 画像 |
| PUT | `/api/customers/{id}` | 更新客户 |
| DELETE | `/api/customers/{id}` | 删除客户 |

### RAG 问答
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | `{"message", "conversation_id"?}` → `{"answer", "sources", "conversation_id"}` |

## 核心功能

**知识库**
- 分类浏览 (财经法税/沟通技巧/行业知识/销售案例)
- 文档上传自动索引到 ChromaDB (PDF/DOCX/TXT/MD/PPTX)
- 全文搜索 + RAG 智能问答 (上下文感知，跨文档推理)

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

**Dashboard**
- 文档/客户统计
- 系统组件健康状态 (FastAPI/PostgreSQL/DeepSeek/ChromaDB)

## License

MIT
