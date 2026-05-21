# AI 销售助手 — 陪跑助手 + 仿真培训

AI 驱动的销售全流程辅助平台，覆盖售前/售中/售后完整链路。核心功能：知识库 RAG 问答 + KB 优先生成、客户画像分析（6 维评分+雷达图）、售前准备报告（5 板块）、资产配置方案（3 套风险等级+手动调整）。

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端框架** | FastAPI (Python 3.11) |
| **数据库** | PostgreSQL (结构化数据) + ChromaDB (向量存储) |
| **ORM** | SQLAlchemy + Alembic (迁移) |
| **LLM** | DeepSeek (`deepseek-reasoner`) |
| **Embedding** | Ollama (`nomic-embed-text`) |
| **文档处理** | LangChain (PDF/DOCX/TXT/MD/PPTX) |
| **前端** | React 19 + TypeScript + Vite + Tailwind CSS 3 + Recharts (响应式适配移动端/宽窄屏) |

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
│   │   │   ├── customer.py      # Customer (含 presales_prep, allocation_plan JSONB)
│   │   │   ├── product.py       # Product (含 nav_history JSONB)
│   │   │   └── training.py      # TrainingSession / Message / Review
│   │   ├── schemas/             # Pydantic 请求/响应
│   │   │   └── training.py      # 训练相关 Pydantic 模型
│   │   ├── routers/             # API 路由
│   │   │   ├── knowledge.py     # 知识库 CRUD + 文档上传/删除（含 ChromaDB 清理）
│   │   │   ├── customer.py      # 客户 CRUD + AI 分析 + 售前准备 + 配置方案
│   │   │   ├── product.py       # 产品库 CRUD + CSV 批量导入
│   │   │   ├── training.py      # 仿真培训 API（7 端点）
│   │   │   └── chat.py          # RAG 问答
│   │   ├── services/
│   │   │   ├── rag_service.py   # DeepSeek 推理 + 对话管理 + 知识库检索工具
│   │   │   ├── embedding_service.py  # ChromaDB 索引（分批嵌入，中文友好分割）
│   │   │   ├── customer_service.py   # 客户 AI 画像 + 售前准备生成（KB 优先）
│   │   │   ├── allocation_service.py # 资产配置方案生成（保守/稳健/进取）
│   │   │   ├── training_service.py   # 客户模拟 + 教练提示 + 复盘报告（KB 优先）
│   │   │   └── fund_service.py       # 东方财富 API 获取真实基金净值走势
│   │   └── utils/
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
│   │   │   └── Training.tsx         # 仿真培训（会话列表 + 聊天 + 复盘弹窗）
│   │   ├── components/
│   │   │   ├── Layout.tsx       # GitHub 风格侧边栏布局
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
│   │   │   ├── PersonaForm.tsx      # 手动创建数字人客户
│   │   │   ├── TrainingSession.tsx  # 训练聊天 + 教练实时提示
│   │   │   └── TrainingReview.tsx   # 复盘报告（雷达图 + 话术 + PDF）
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
- **Ollama**（需运行并已拉取 `nomic-embed-text` 模型）
- **Node.js** 18+
- **4 个服务缺一不可**：PostgreSQL → Ollama → Backend → Frontend

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

## API 端点

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

**知识库**
- 分类浏览（财经法税/沟通技巧/行业知识/销售案例）
- 文档上传自动索引到 ChromaDB（PDF/DOCX/TXT/MD/PPTX），带上传进度条
- 全文搜索 + RAG 智能问答（上下文感知，跨文档推理）
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

## License

MIT
