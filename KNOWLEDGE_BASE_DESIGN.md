# 知识库设计文档

## 整体架构

```
文档上传 → 文本提取 → 分块(chunk) → Jina Embedding → ChromaDB向量存储
                ↓
          PostgreSQL (元数据: 标题/分类/文件路径等)
                ↓
          RAG问答: 用户提问 → ChromaDB检索 → DeepSeek生成回答
```

## 数据模型

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

自引用外键 `parent_id` 支持无限层级子分类。

### documents 表 — 文档元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK→users.id, nullable | 所有者，NULL=共享文档 |
| category_id | UUID FK→categories.id | 主分类 |
| file_path | String(500) | 文件路径 |
| file_type | String(20) | 文件类型(pdf/docx/xlsx等) |
| content_preview | Text | 内容预览(前200字) |
| chunk_count | Integer | 分块数量 |
| is_archived | Boolean | 是否归档 |
| created_at | DateTime | 创建时间 |

### document_categories 关联表 — 多对多

| 字段 | 类型 | 说明 |
|------|------|------|
| document_id | UUID FK→documents.id | 文档ID |
| category_id | UUID FK→categories.id | 分类ID |

一个文档可属于多个分类。

## 核心流程

### 1. 文档上传与索引

```
上传文件 → 保存到 ./documents/ → load_single_document() 提取文本
→ RecursiveCharacterTextSplitter 分块(chunk_size=512, overlap=100)
→ Jina AI jina-embeddings-v3 向量化 → ChromaDB 持久化
→ PostgreSQL 写入文档元数据
```

支持的格式：PDF、DOCX、DOC、PPTX、PPT、TXT、MD、XLS、XLSX、XLSM、CSV

### 2. RAG 问答

```
用户提问 → retrieve_from_chroma() 相似度检索(top_k=8)
→ 拼接 context 注入 prompt → DeepSeek 生成回答
→ 来源标注：知识库内容标〔来源：xxx.pdf〕，个人看法标【个人看法】
```

### 3. 文档预览

- `GET /documents/{id}/content` 返回文本内容
- Word 文档自动转 HTML 富文本预览
- Excel/CSV 返回表格数据(前100行)

## 权限隔离

### 文档分层

- `user_id = NULL` → 共享文档，全员可见
- `user_id = 用户ID` → 个人文档，仅自己和admin可见

### 查询过滤

```python
# admin → 全部文档
# 普通用户 → 共享文档 + 自己的文档
apply_document_filter(query, Document, current_user)
```

### ChromaDB 向量层同步过滤

```python
{"$or": [{"user_id": "shared"}, {"user_id": "<user_uuid>"}]}
```

## API 端点

### 分类管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/knowledge/categories | 分类列表(含文档数、子分类数) |
| POST | /api/knowledge/categories | 创建分类(支持 parent_id) |
| DELETE | /api/knowledge/categories/{id} | 删除分类(子分类自动提升) |
| POST | /api/knowledge/categories/{id}/icon | 上传分类图标 |

### 文档管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/knowledge/documents | 文档列表(分页/分类筛选/搜索/归档) |
| POST | /api/knowledge/documents | 上传文档 |
| GET | /api/knowledge/documents/{id} | 文档详情 |
| GET | /api/knowledge/documents/{id}/content | 文档内容(文本/HTML/表格) |
| GET | /api/knowledge/documents/{id}/download | 下载文档(?inline=true 内联预览) |
| PUT | /api/knowledge/documents/{id}/categories | 更新文档分类 |
| PATCH | /api/knowledge/documents/{id}/archive | 归档/取消归档 |
| DELETE | /api/knowledge/documents/{id} | 删除文档(同步清理ChromaDB) |

### RAG 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/chat | RAG问答(自动检索+LLM生成) |

## 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 文本分块 | RecursiveCharacterTextSplitter | chunk_size=512, overlap=100 |
| Embedding | Jina AI jina-embeddings-v3 | OpenAI兼容API, 免费100万token/天 |
| 向量存储 | ChromaDB | 本地持久化, 零配置 |
| LLM | DeepSeek API | OpenAI兼容客户端 |
| 文档解析 | PyMuPDF/mammoth/pandas | PDF/Word/Excel多格式 |

## KB-First 原则

所有 LLM 生成(客户分析、售前准备、资产配置、培训教练等)统一遵循：

- 优先从 ChromaDB 检索知识库内容
- 知识库支撑的内容标注 **基于知识库**
- AI 自行推断的内容标注 **AI分析**
- 严禁编造知识库中不存在的信息

## 关键约束

- 需配置 `JINA_API_KEY`，否则知识库上传和 RAG 问答全部崩溃
- ChromaDB 数据存储在 `./chroma_db/`，文档存储在 `./documents/`
- 文本分割分隔符包含中文标点（`。！？；，`）
- Embedding 分批：每批 4 个 chunk，避免 token 上下文溢出
- 文档删除时同步清理 ChromaDB 向量（通过 filename 元数据匹配）
- 对话历史按 `user_id:conversation_id` 命名空间隔离(内存存储)
