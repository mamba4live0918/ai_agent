# 混合 RAG 知识库双模式设计

## 背景

当前知识库使用 ChromaDB + Jina Embedding + 固定 chunk_size=512 的纯向量检索，存在检索不准的问题。用户需要手动切换精准/灵活两种问答模式，共用同一套文档库。

## 设计概览

```
文档上传 → 语义分块(带标题元数据) → 双索引(向量+BM25) 
                                            ↓
用户提问 → 模式选择(精准/灵活) → 双路召回 → 去重合并 → Prompt生成 → LLM回答
```

## 改动范围

### 1. 检索层：双路召回 (embedding_service.py)

- **向量检索**：ChromaDB `similarity_search`（已有，保持不变）
- **关键词检索**：新增 `BM25Okapi`（rank_bm25 库），文档上传时构建索引存 JSON 到 `./bm25_index/`，检索时加载
- **合并逻辑**：按 `(filename, chunk_index)` 去重，向量优先
- **模式阈值**：
  - 精准模式：相似度 >= 0.7，最终返回 top 4-6
  - 灵活模式：相似度 >= 0.4，最终返回 top 8-12

### 2. Prompt 层：双套模板 (rag_service.py)

**精准模式**：
- 严格基于文档，每个观点标注来源文件
- 无匹配时直接说"暂无相关内容"，不编造
- temperature=0.1, max_tokens=2000

**灵活模式**：
- 优先 KB，允许补充行业常识标注【个人看法】
- 可跨文档推理
- temperature=0.3, max_tokens=15000（保持现有）

### 3. 前端：模式切换 (ChatPanel.tsx)

- 聊天顶部加 segmented control：`精准 | 灵活`
- 切换仅修改 `mode` 参数传给后端 `/api/chat`
- 不清空对话历史
- 默认精准模式

### 4. 分块元数据增强 (embedding_service.py)

- 分块时保留文档标题作为元数据 `section_title`
- 不改 chunk_size（512），不动现有 chroma_db

## API 改动

`POST /api/chat` 新增可选字段 `mode: "precise" | "flexible"`（默认 precise）

## 依赖

- `rank_bm25`：轻量 BM25 实现，pip install
- 不需要新数据库、不需要 GPU

## 不在范围内

- Reranker 重排序（后续迭代）
- Milvus/FAISS 迁移
- 会话持久化到数据库（后续迭代）