from ..config import ServiceError, settings
from .embedding_service import retrieve_from_chroma, retrieve_hybrid
from .prompt_templates import clean_llm_content, get_deepseek_client

_client = get_deepseek_client()

# In-memory conversation store: {conversation_id: [(user, assistant), ...]}
_conversations: dict[str, list[tuple[str, str]]] = {}


def _get_or_create_history(conversation_id: str | None) -> tuple[str, list[tuple[str, str]]]:
    cid = conversation_id or "default"
    if cid not in _conversations:
        _conversations[cid] = []
    return cid, _conversations[cid]


def _build_context(docs: list, mode: str) -> tuple[str, list[dict]]:
    """Build context string and sources list from retrieved docs."""
    context_parts = []
    sources = []
    for i, doc in enumerate(docs):
        if hasattr(doc, 'metadata'):
            filename = doc.metadata.get("filename", "Unknown")
            page = doc.metadata.get("page", "Unknown")
            content = doc.page_content
        else:
            filename = doc.get("metadata", {}).get("filename", "Unknown")
            page = doc.get("metadata", {}).get("page", "Unknown")
            content = doc.get("content", "")

        context_parts.append(
            f"[Document {i + 1}]\nFile: {filename}\nPage: {page}\nContent: {content}"
        )
        sources.append({"filename": filename, "page": page, "preview": content[:200]})

    return "\n\n".join(context_parts), sources


def retrieve_context(query: str, user_id: str, mode: str = "flexible", k: int = 8, filenames: list[str] | None = None) -> tuple[str, list[dict]]:
    try:
        if mode == "precise":
            docs = retrieve_hybrid(query, user_id=user_id, mode="precise", k=6, filenames=filenames)
        else:
            docs = retrieve_hybrid(query, user_id=user_id, mode="flexible", k=12, filenames=filenames)
    except Exception:
        return "", []

    return _build_context(docs, mode)


PRECISE_PROMPT = """你是 SalesMate，一位严谨的知识库问答助手。你必须**严格基于**提供的文档内容回答。

核心规则：
- 回答语言：中文
- 每一条陈述都必须能在文档中找到依据，**不得添加文档中没有的信息**
- 每个关键观点必须标注来源，格式：〔来源：xxx.pdf〕
- 如果文档中没有相关信息，直接回答"知识库中暂无相关内容"，**不要编造**
- 可以引用多份文档，但如果文档间有矛盾，明确指出差异
- 回答简洁专业，不要展开推测"""

FLEXIBLE_PROMPT = """你是一位资深销售顾问助手，名叫 SalesMate。请用自然、专业但亲切的口吻回答用户问题。

核心规则：
- 回答语言：中文（除非用户用英文提问）
- 保持对话感，像一位有经验的同事在分享见解
- 优先基于知识库文档内容，但要自然融入回答，不要机械引用
- 可以补充行业常识和实操经验，用【个人看法】开头区分
- 可以跨文档综合推理"""


def query_llm(question: str, context: str, mode: str = "flexible", conversation_id: str | None = None) -> dict:
    cid, history = _get_or_create_history(conversation_id)

    history_text = ""
    for human, assistant in history[-3:]:
        history_text += f"User: {human}\nAssistant: {assistant}\n"

    has_context = bool(context.strip())

    if mode == "precise":
        rules = PRECISE_PROMPT
        if has_context:
            rules += f"""

【知识库检索结果 — 这是你唯一的回答依据】
---
{context}
---"""
        else:
            rules += "\n\n【注意】未检索到相关文档。请直接回复'知识库中暂无相关内容'。"
        temperature = 0.1
        max_tokens = 2000
    else:
        rules = FLEXIBLE_PROMPT
        if has_context:
            rules += f"""

【知识库内容优先】
以下是从你的知识库文档中检索到的相关内容：
---
{context}
---

引用与标注：
- 基于知识库内容的在句末标注 〔来源：xxx.pdf〕
- 个人看法用 【个人看法】 开头，2-3句以内"""
        else:
            rules += "\n\n【注意】当前知识库为空。请基于专业知识回答，开头说明'知识库中暂无相关文档，以下是我的个人理解'。"
        temperature = 0.3
        max_tokens = 15000

    prompt = f"""{rules}

对话历史：
{history_text}

用户问题：{question}

请回答："""

    sys_content = "你是 SalesMate，一位严谨的知识库问答助手。必须严格基于文档回答。" if mode == "precise" else "你是 SalesMate，一位资深销售顾问助手。你说话自然、专业、像一位值得信赖的同事。"

    try:
        response = _client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": sys_content},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as e:
        raise ServiceError(f"DeepSeek API call failed: {e}")

    if not response.choices or not response.choices[0].message:
        raise ServiceError("DeepSeek returned an empty response")

    answer = response.choices[0].message.content
    if answer is None or answer.strip() == "":
        raise ServiceError("DeepSeek returned empty content")

    answer = clean_llm_content(answer)

    history.append((question, answer))

    return {"answer": answer, "conversation_id": cid}


def chat(message: str, user_id: str, mode: str = "flexible", conversation_id: str | None = None) -> dict:
    context, sources = retrieve_context(message, user_id=user_id, mode=mode)
    result = query_llm(message, context, mode=mode, conversation_id=conversation_id)
    result["sources"] = sources
    return result


def search_knowledge_base(query: str, user_id: str, k: int = 5, filenames: list[str] | None = None) -> str:
    """Search KB for relevant content. Returns formatted prompt-ready string or empty string on failure.
    Optionally restrict to specific filenames for document-scoped generation."""
    try:
        context, _ = retrieve_context(query, user_id=user_id, k=k, filenames=filenames)
        if not context.strip():
            return ""
        scope_note = ""
        if filenames:
            scope_note = "\n".join(f"- {f}" for f in filenames)
            scope_note = f"\n【限定范围】仅从以下文档中检索：\n{scope_note}\n"
        return f"""
【知识库匹配内容】
以下是从知识库中检索到的相关文档内容，请优先参考这些材料进行分析和生成。
{scope_note}
{context}
"""
    except Exception:
        return ""
