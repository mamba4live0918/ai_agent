# 知识库系统设计总结（可复用 Prompt 模板）

## 一、总体架构

```
用户上传文档 → 文件类型检测 → 文档加载器 → 文本分块 → ChromaDB 向量存储（BGE-m3 Embedding）
                                                              ↕
用户提问 → 混合检索（向量 + BM25）→ DeepSeek LLM 生成回答 → 返回答案 + 来源引用
```

## 二、技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| 向量数据库 | **ChromaDB**（本地持久化） | 轻量级，Python 原生，无服务依赖 |
| Embedding 模型 | **BAAI `bge-m3`** | 本地部署（sentence-transformers），568M 参数，1024 维，8192 token 上下文，中文 SOTA |
| 关键词检索 | **BM25** (rank-bm25 + jieba 分词) | 弥补向量检索对精确关键词匹配的不足 |
| 混合检索策略 | 向量检索结果优先 + BM25 去重补充 | 兼顾语义理解和关键词命中 |
| LLM | **DeepSeek Chat** | OpenAI 兼容客户端 |
| 文档加载 | PyMuPDF / Docx2txtLoader / python-pptx / pandas | 支持 PDF/DOCX/PPTX/TXT/MD/XLSX/CSV |

### BGE-m3 Embedding

```python
from sentence_transformers import SentenceTransformer

class BGEEmbeddings:
    """BGE-m3 本地 Embedding，无需外部 API，零网络依赖。"""
    def __init__(self, model_name="BAAI/bge-m3", device="cpu"):
        self._model = SentenceTransformer(model_name, device=device)

    def embed_documents(self, texts):
        return self._model.encode(
            texts, normalize_embeddings=True
        ).tolist()

    def embed_query(self, text):
        return self._model.encode(
            text, normalize_embeddings=True
        ).tolist()
```

| 属性 | 值 |
|------|-----|
| 模型 | BAAI/bge-m3 |
| 参数量 | 568M |
| 向量维度 | 1024 |
| 上下文窗口 | 8192 token |
| 中文 C-MTEB 检索 | ~66-68 |
| 运行时内存 | ~2.2 GB |
| 下载大小 | ~2.2 GB |
| 依赖 | sentence-transformers |

## 三、文本分块策略

```python
chunk_size=512       # 每块最大 512 字符
chunk_overlap=100    # 块间重叠 100 字符
separators=["\n\n", "\n", "。", "！", "？", "；", "，", ".", " ", ""]
# 优先在自然段落和中文标点处切分
```

## 四、Embedding 分批写入

```python
batch_size = 4  # 每批 4 个 chunk，避免 token 上下文溢出
```

- 第一批：`Chroma.from_documents()` 自动创建 collection
- 后续批次：`vectorstore.add_documents()` 追加写入

## 五、混合检索（Hybrid Search）

核心函数：`retrieve_hybrid(query, user_id, mode, k)`

### 检索管道

```
1. 向量检索：ChromaDB similarity_search (user_id 过滤，k=8/12)
2. BM25 检索：全量构建 BM25Okapi 索引 → jieba 分词查询 → 按分数 top-k
3. 用户过滤：BM25 结果按 user_id / shared 过滤
4. 去重合并：向量结果优先，按 content[:100] 去重，BM25 补充
5. 数量控制：precise 模式 6 条，flexible 模式 12 条
```

### 两种检索模式

| 模式 | k | 用途 | LLM temperature | max_tokens |
|------|---|------|----------------|------------|
| `precise` | 6 | 严格基于文档，不编造 | 0.1 | 2000 |
| `flexible` | 12 | 文档优先 + 允许补充行业经验 | 0.3 | 15000 |

## 六、多租户数据隔离

```python
# ChromaDB metadata 过滤
user_filter = {
    "$or": [
        {"user_id": "shared"},    # 共享文档（管理员上传，user_id=NULL）
        {"user_id": str(user_id)}, # 个人文档
    ]
}
```

- **共享文档**（user_id="shared"）：管理员上传 / 基础文档，全员可见
- **个人文档**（user_id={uuid}）：普通用户上传，仅自己可见
- 删除文档时通过 `filename` 元数据匹配，同步清理 ChromaDB 向量

## 七、LLM 两套 Prompt 设计

### Precise 模式（严谨问答）

```
你是 [助手名]，一位严谨的知识库问答助手。你必须严格基于提供的文档内容回答。

核心规则：
- 回答语言：中文
- 每一条陈述都必须能在文档中找到依据，不得添加文档中没有的信息
- 每个关键观点必须标注来源，格式：〔来源：xxx.pdf〕
- 如果文档中没有相关信息，直接回答"知识库中暂无相关内容"，不要编造
- 可以引用多份文档，但如果文档间有矛盾，明确指出差异
- 回答简洁专业，不要展开推测
```

### Flexible 模式（顾问对话）

```
你是一位资深[领域]顾问助手，名叫 [助手名]。请用自然、专业但亲切的口吻回答。

核心规则：
- 回答语言：中文（除非用户用英文提问）
- 保持对话感，像一位有经验的同事在分享见解
- 优先基于知识库文档内容，但要自然融入回答，不要机械引用
- 可以补充行业常识和实操经验，用【个人看法】开头区分
- 可以跨文档综合推理
```

## 八、KB-First 原则（核心设计模式）

**所有 LLM 生成类服务**，在调用 DeepSeek 前先从知识库检索相关内容注入 prompt：

```python
# 统一入口函数
kb_context = search_knowledge_base(query, user_id=user_id, k=5)

# 返回格式（直接可注入 prompt）
"""
【知识库匹配内容】
以下是从知识库中检索到的相关文档内容，请优先参考这些材料进行分析和生成。

[Document 1]
File: xxx.pdf
Page: 3
Content: ...

[Document 2]
File: yyy.docx
Page: 5
Content: ...
"""
```

### KB-First 调用方

| 服务 | 场景 | 调用位置 |
|------|------|----------|
| `customer_service.py` | 客户分析、售前准备 | 客户画像生成、售前建议 |
| `allocation_service.py` | 资产配置方案 | 配置方案生成 |
| `training_service.py` | 仿真培训 | 客户模拟、教练提示、复盘报告 |
| `post_sales_service.py` | 售后分析 | 售后报告、通话摘要 |
| `quiz_service.py` | 知识库练习 | 题目生成（按文档范围限定） |

### 标注规范

```
📚 或 📚基于知识库 — 知识库支撑的内容
💡AI分析 — 知识库未覆盖、AI 自行推断的内容
```
**严禁编造知识库中不存在的信息。**

## 九、数据模型

### categories 表 — 支持层级嵌套

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| name | String(50) UNIQUE | 分类名称 |
| description | Text | 描述 |
| icon | String(50) | 图标文件名 |
| sort_order | Integer | 排序 |
| parent_id | UUID FK→categories.id | 父分类，NULL=根分类 |
| created_at | DateTime | 创建时间 |

### documents 表 — 文档元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK→users.id, nullable | 所有者，NULL=共享文档 |
| category_id | UUID FK→categories.id | 主分类 |
| file_path | String(500) | 文件路径 |
| file_type | String(20) | 文件类型 |
| content_preview | Text | 内容预览(前200字) |
| chunk_count | Integer | 分块数量 |
| is_archived | Boolean | 是否归档 |
| created_at | DateTime | 创建时间 |

### document_categories 关联表 — 多对多

| 字段 | 类型 | 说明 |
|------|------|------|
| document_id | UUID FK→documents.id | 文档ID |
| category_id | UUID FK→categories.id | 分类ID |

## 十、支持的文档格式

| 格式 | 加载器 | 备注 |
|------|--------|------|
| PDF | PyMuPDFLoader | 单页一 Document |
| DOCX | Docx2txtLoader | 提取纯文本 |
| DOC | UnstructuredWordDocumentLoader | mode="single" |
| PPTX | python-pptx 自定义 | 按 Slide 分块，含 Slide N: 标注 |
| TXT/MD | TextLoader | UTF-8 编码 |
| XLSX/XLS/CSV | pandas | 每 Sheet 一个 Document，TSV 格式化 |

### 文件上传 MIME 校验

```python
import filetype
kind = filetype.guess(contents)  # 基于文件魔数，不信任扩展名

ALLOWED_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", # PPTX
}
```

## 十一、API 端点汇总

```
GET    /api/knowledge/categories          # 分类列表（含文档计数）
POST   /api/knowledge/categories          # 创建分类
DELETE /api/knowledge/categories/{id}     # 删除分类（子分类提升）
POST   /api/knowledge/categories/{id}/icon # 上传分类图标

GET    /api/knowledge/documents           # 文档列表（分页/搜索/按分类过滤）
POST   /api/knowledge/documents           # 上传文档（自动索引到 ChromaDB）
GET    /api/knowledge/documents/{id}      # 文档详情
GET    /api/knowledge/documents/{id}/content  # 文档内容（Word 转 HTML，Excel 转表格）
GET    /api/knowledge/documents/{id}/download # 下载（?inline=true 内联预览）
DELETE /api/knowledge/documents/{id}      # 删除文档（同步清理 ChromaDB）
PATCH  /api/knowledge/documents/{id}/archive  # 归档/取消归档
PUT    /api/knowledge/documents/{id}/categories # 更新文档分类

POST   /api/chat                          # RAG 问答（precise/flexible 模式）
GET    /api/chat/conversations            # 对话列表
GET    /api/chat/conversations/{id}       # 对话消息
DELETE /api/chat/conversations/{id}       # 删除对话
```

## 十二、关键约束与注意事项

1. **Embedding 模型本地部署**：BGE-m3 首次启动从 HuggingFace 下载约 2.2GB，运行时占约 2.2GB 内存。如 HuggingFace 不可达，设置 `HF_ENDPOINT=https://hf-mirror.com` 使用镜像
2. **ChromaDB 本地持久化**：数据在 `./chroma_db/` 目录，不需要外部服务
3. **Embedding 分批写**：`batch_size=4` 避免 token 上下文溢出
4. **检索失败静默回退**：retrieve 异常时返回空字符串，不中断 LLM 调用
5. **对话命名空间**：`{user_id}:{conversation_id}` 前缀隔离
6. **LLM 输出清洗**：移除 `(<think>.*?</think>)` 块 → 提取 markdown JSON fence → 清理控制字符
7. **文件上传异常处理**：文档处理失败时自动删除已保存的文件，不残留脏数据
8. **中文分词**：jieba 分词 + BM25，分隔符含中文标点（`。！？；，`）

---

## 十三、核心代码文件索引

### 后端

| 文件 | 职责 |
|------|------|
| `backend/app/services/embedding_service.py` | ChromaDB 向量存储、BGE-m3 Embedding、混合检索 |
| `backend/app/services/rag_service.py` | RAG 问答、KB-First 入口、两种模式 Prompt |
| `backend/app/utils/document_loader.py` | 多格式文档加载（PDF/DOCX/PPTX/XLSX/CSV） |
| `backend/app/routers/knowledge.py` | 知识库 CRUD API（分类 + 文档上传/删除） |
| `backend/app/routers/chat.py` | 对话 API（创建/列表/消息/删除） |
| `backend/app/models/knowledge.py` | Category / Document ORM 模型 |
| `backend/app/models/chat.py` | ChatConversation / ChatMessage ORM 模型 |
| `backend/app/services/prompt_templates.py` | LLM 工具函数（客户端/清洗/JSON 提取） |
| `backend/app/config.py` | 配置（ChromaDB 路径、模型名、API Key） |

### 前端

| 文件 | 职责 |
|------|------|
| `frontend/src/pages/KnowledgeBase.tsx` | 知识库主页面，整合所有子组件 |
| `frontend/src/components/ChatPanel.tsx` | RAG 问答面板（对话历史 + 消息 + 输入） |
| `frontend/src/components/QuizPanel.tsx` | 知识库练习（生成/答题/成绩三模式） |
| `frontend/src/components/PdfPreview.tsx` | PDF 预览（react-pdf + 缩放/翻页） |
| `frontend/src/components/DocumentUpload.tsx` | 文档上传（分类选择 + 进度条） |
| `frontend/src/components/SearchBar.tsx` | 搜索栏（带清除按钮） |
| `frontend/src/components/CategoryIcon.tsx` | 分类图标渲染 |
| `frontend/src/services/api.ts` | API 层（knowledge/chat/quiz 端点封装） |

## 十四、前端设计

### 页面结构

```
KnowledgeBase.tsx（知识库主页面）
├── SearchBar                    — 文档搜索
├── DocumentUpload               — 上传文档（选分类 + 进度条）
├── 分类树（CategoryTree）        — 层级文件夹 + 展开/折叠 + 编辑/删除
│   ├── 最近文档                  — localStorage 持久化最近 30 条
│   ├── 分类节点（递归渲染）       — 文档列表 + 子分类
│   └── 未分类                    — 无分类文档兜底
├── 文档行                        — 预览/下载/移动分类/删除（hover 显示）
├── 分页控件                      — 页码 + 省略号 + 首末页
├── 浮窗面板
│   ├── ChatPanel                — 知识库问答（precise/flexible 切换）
│   │   ├── 对话历史侧边栏         — 毛玻璃折叠面板
│   │   ├── 消息列表              — user/assistant 气泡 + 来源标注
│   │   └── 输入框               — Enter 发送
│   └── QuizPanel                — 知识库练习
│       ├── 选题模式              — 选分类/文档/数量/题型
│       ├── 答题模式              — 逐题作答 + 进度条
│       └── 成绩模式              — 总分 + 逐题解析 + 参考答案
├── PdfPreview                   — PDF 浮窗预览（react-pdf, 缩放/翻页）
└── 非 PDF 预览浮窗               — HTML 富文本/表格/纯文本
```

### 核心交互

| 功能 | 实现 |
|------|------|
| 分类树 | `categoryTree` — `parent_id` 自引用递归渲染，`useMemo` 构建，`expandedFolders` Set 控折叠 |
| 最近文档 | `localStorage` 存 30 条，访问即记录，跨 session 持久化 |
| 预览分流 | PDF/PPT/PPTX → `PdfPreview`（react-pdf canvas），DOCX → `mammoth` HTML，XLSX/CSV → `<table>`，其余 → `<pre>` |
| 文档移动 | 每行独立 `movingDocId` 状态，勾选多个分类，`updateDocumentCategories` |
| 分类删除 | 确认弹窗 → 子分类自动提升到父级，文档脱钩入未分类 |
| 上传进度 | `XMLHttpRequest` + `onprogress` 回调，进度条动画 |
| 问答面板 | 浮动居中 480px 宽弹窗，模式切换（精准/灵活），历史侧边栏毛玻璃 |
| 练习面板 | 分类/文档筛选 → 生成题目 → 逐题作答 → 提交评分 → 逐题解析 |
| 亮暗主题 | CSS 变量 `--bg-primary` / `--text-primary` 等，`html.light` class 切换 |

### 关键组件文件

| 文件 | 职责 |
|------|------|
| `frontend/src/pages/KnowledgeBase.tsx` | 知识库主页面，整合所有子组件 |
| `frontend/src/components/ChatPanel.tsx` | RAG 问答面板（对话历史 + 消息 + 输入） |
| `frontend/src/components/QuizPanel.tsx` | 知识库练习（生成/答题/成绩三模式） |
| `frontend/src/components/PdfPreview.tsx` | PDF 预览（react-pdf + 缩放/翻页） |
| `frontend/src/components/DocumentUpload.tsx` | 文档上传（分类选择 + 进度条） |
| `frontend/src/components/SearchBar.tsx` | 搜索栏（带清除按钮） |
| `frontend/src/components/CategoryIcon.tsx` | 分类图标渲染 |
| `frontend/src/services/api.ts` | API 层（knowledge/chat/quiz 端点封装） |

---

## 十五、多知识库独立部署设计（市场部 + 招投标部）

### 设计目标

每个部门拥有**完全独立的知识库**，就像一个部门一套完整实例。不共享分类、文档、对话、练习记录。用户通过顶部 Tab 切换部门，切换后所有数据（文档列表、分类树、问答、练习）都是该部门的独立空间。

```
┌─────────────────────────────────────────────────┐
│  [市场部]  [招投标部]                              │  ← 部门 Tab 栏
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ 分类树    │  │ 文档列表  │  │ 问答 / 练习    │ │  ← 与当前单知识库
│  │ (独立)    │  │ (独立)    │  │ (独立)         │ │    完全相同的功能
│  └──────────┘  └──────────┘  └───────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 后端改动

#### 1. 新增 `departments` 表

```sql
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,       -- "市场部" / "招投标部"
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 预置两个部门
INSERT INTO departments (name) VALUES ('市场部'), ('招投标部');
```

#### 2. 已有表加 `department_id` 外键

每张表加 `department_id`（NOT NULL，带 FK），实现完全隔离：

```sql
ALTER TABLE categories ADD COLUMN department_id UUID NOT NULL REFERENCES departments(id);
ALTER TABLE documents ADD COLUMN department_id UUID NOT NULL REFERENCES departments(id);
ALTER TABLE chat_conversations ADD COLUMN department_id UUID NOT NULL REFERENCES departments(id);
ALTER TABLE quiz_sessions ADD COLUMN department_id UUID NOT NULL REFERENCES departments(id);
```

#### 3. ChromaDB 向量层隔离

每个部门一个独立 Collection，最强隔离，互不影响：

```python
# embedding_service.py — 按部门创建/访问独立 collection
def _get_chroma_collection(department_id: str) -> Chroma:
    persist_dir = settings.chroma_db_dir  # e.g. "./chroma_db"
    collection_name = f"kb_department_{department_id}"
    return Chroma(
        persist_directory=persist_dir,
        embedding_function=_embedding_function,
        collection_name=collection_name,
    )

# 检索时指定部门
def retrieve_from_chroma(query: str, department_id: str, k: int = 8) -> list:
    vectorstore = _get_chroma_collection(department_id)
    return vectorstore.similarity_search(query, k=k)

# 文档索引时写入对应部门
def index_document(filepath: str, department_id: str, user_id: str) -> int:
    docs = load_single_document(filepath)
    chunks = _text_splitter.split_documents(docs)
    for chunk in chunks:
        chunk.metadata["department_id"] = department_id
        chunk.metadata["uploaded_by"] = user_id
    add_to_chroma(chunks, department_id)  # 写入部门专属 collection
    return len(chunks)

# 删除时只在当前部门内匹配
def delete_from_chroma(filename: str, department_id: str) -> None:
    vectorstore = _get_chroma_collection(department_id)
    vectorstore.delete(where={"filename": filename})
```

集合命名规则：`kb_department_{uuid}`。每个部门完全隔离，检索不会跨部门。

#### 4. API 路由 — 所有端点加 department 前缀

```
POST   /api/knowledge/{dept_id}/categories          # 创建分类
GET    /api/knowledge/{dept_id}/categories           # 分类列表
DELETE /api/knowledge/{dept_id}/categories/{id}      # 删除分类

GET    /api/knowledge/{dept_id}/documents            # 文档列表
POST   /api/knowledge/{dept_id}/documents            # 上传文档
GET    /api/knowledge/{dept_id}/documents/{id}       # 文档详情
DELETE /api/knowledge/{dept_id}/documents/{id}       # 删除文档

POST   /api/chat/{dept_id}                           # RAG 问答
GET    /api/chat/{dept_id}/conversations             # 对话列表
GET    /api/chat/{dept_id}/conversations/{id}        # 对话消息

POST   /api/quiz/{dept_id}/sessions                  # 生成练习
GET    /api/quiz/{dept_id}/sessions                  # 练习记录
```

或者保持 URL 结构不变，通过 query param `?department_id=xxx` 传递，后端依赖注入校验权限。

#### 5. 权限控制

```python
# auth.py — 新增依赖
def require_department_access(dept_id: str, current_user: User):
    """校验用户是否有权访问该部门的知识库"""
    # 管理员：所有部门
    if current_user.role == "admin":
        return
    # 普通用户：只能访问自己所属部门
    if current_user.department_id != dept_id:
        raise HTTPException(403, "无权访问该部门知识库")
```

### 前端改动

#### 1. 部门 Tab 栏 — 全局上下文

```tsx
// context/DepartmentContext.tsx — 新建
interface DepartmentContextType {
  currentDept: Department;        // 当前选中的部门
  departments: Department[];      // 所有可访问的部门
  switchDept: (id: string) => void;
}

// 用法：所有知识库相关页面读取 currentDept.id
const { currentDept } = useDepartment();
getCategories(currentDept.id);
```

#### 2. KnowledgeBase.tsx — 加 Tab 栏

```
┌──────────────────────────────────────────────────┐
│  [🏢 市场部]   [🏢 招投标部]                       │  ← Tab 栏（顶部固定）
├──────────────────────────────────────────────────┤
│                                                  │
│   搜索...  上传文档...                             │  ← 原有工具栏
│                                                  │
│   📁 分类树          📄 文档列表                   │  ← 内容区（根据 currentDept 联动）
│     ├ 行业报告          ● Q2市场分析.pdf            │
│     ├ 竞品资料          ● 广告投放策略.docx          │
│     └ 营销方案          ● 客户案例汇总.pptx          │
│                                                  │
│   [知识库问答] [知识库练习]                         │  ← 浮动面板
│                                                  │
└──────────────────────────────────────────────────┘
```

#### 3. 数据流 — Tab 切换联动

```tsx
// KnowledgeBase.tsx 核心逻辑
const { currentDept } = useDepartment();

// 部门切换时重置所有状态
useEffect(() => {
  setPage(1);
  setSelectedCat(null);
  setSearch('');
  setShowChat(false);
  setShowQuiz(false);
  closePreview();
  loadData();              // loadData 内部使用 currentDept.id
}, [currentDept.id]);

// API 调用全部带上部门 ID
const loadData = async () => {
  const cats = await getCategories(currentDept.id);
  setCategories(cats);
  const docs = await getDocuments(currentDept.id, selectedCat, search, page);
  setDocuments(docs.items);
};
```

#### 4. localStorage — 按部门命名空间隔离

```tsx
// 旧：全局
const RECENT_KEY = 'kb_recent_docs';

// 新：按部门
const RECENT_KEY = `kb_recent_docs_${currentDept.id}`;
```

#### 5. 新增/修改的前端文件

| 文件 | 动作 | 说明 |
|------|------|------|
| `context/DepartmentContext.tsx` | **新建** | 部门上下文，管理 `currentDept` 状态 |
| `pages/KnowledgeBase.tsx` | 修改 | 顶部加 Tab 栏，所有数据按部门联动 |
| `components/ChatPanel.tsx` | 修改 | 对话 API 传入 `department_id` |
| `components/QuizPanel.tsx` | 修改 | 练习 API 传入 `department_id` |
| `services/api.ts` | 修改 | 所有 knowledge/chat/quiz 函数加 `deptId` 参数 |

### 改动量估算

| 层 | 工作量 | 说明 |
|----|--------|------|
| 数据库 | 1张新表 + 4个已有表加列 | migration 脚本 ~20 行 |
| 后端 embedding | 改 3 个函数 | 加 `department_id` 参数 + ChromaDB collection 命名 |
| 后端路由 | 所有端点 URL 加 `{dept_id}` | ~10 个端点 |
| 后端权限 | 新增 1 个依赖注入 | ~15 行 |
| 前端 | 1 个新 Context + 改 4 个组件 | ~150 行改动 |
| **总计** | **~200 行代码改动** | 大部分架构复用，不改核心逻辑 |

### 不需要改的

- 混合检索逻辑（`retrieve_hybrid`）— 从独立 collection 检索，逻辑不变
- RAG 两套 Prompt — 两个部门共用同一套 Prompt 模板
- KB-First 模式 — 完全复用
- 文档加载/分块/Embedding — 完全复用
- 前端 UI 组件（ChatPanel / QuizPanel / PdfPreview / DocumentUpload）— 只加 `deptId` 参数
