import re
from openai import OpenAI

from ..config import settings
from .embedding_service import retrieve_from_chroma

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

# In-memory conversation store: {conversation_id: [(user, assistant), ...]}
_conversations: dict[str, list[tuple[str, str]]] = {}


def _get_or_create_history(conversation_id: str | None) -> tuple[str, list[tuple[str, str]]]:
    cid = conversation_id or "default"
    if cid not in _conversations:
        _conversations[cid] = []
    return cid, _conversations[cid]


def retrieve_context(query: str, user_id: str, k: int = 8) -> tuple[str, list[dict]]:
    try:
        docs = retrieve_from_chroma(query, user_id=user_id, k=k)
    except Exception:
        return "", []

    context_parts = []
    sources = []
    for i, doc in enumerate(docs):
        filename = doc.metadata.get("filename", "Unknown")
        page = doc.metadata.get("page", "Unknown")
        context_parts.append(
            f"[Document {i + 1}]\nFile: {filename}\nPage: {page}\nContent: {doc.page_content}"
        )
        sources.append({"filename": filename, "page": page, "preview": doc.page_content[:200]})

    return "\n\n".join(context_parts), sources


def query_llm(question: str, context: str, conversation_id: str | None = None) -> dict:
    cid, history = _get_or_create_history(conversation_id)

    history_text = ""
    for human, assistant in history[-3:]:
        history_text += f"User: {human}\nAssistant: {assistant}\n"

    has_context = bool(context.strip())

    base_rules = f"""你是一位资深销售顾问助手，名叫 SalesMate。请用自然、专业但亲切的口吻回答用户问题。

核心规则：
- 回答语言：中文（除非用户用英文提问）
- 保持对话感，像一位有经验的同事在分享见解，不要像在读说明书
- 回答要有条理，但不要用"第一、第二、第三"这种生硬的序号，用自然的段落过渡
- 可以补充行业常识和实操经验，但要简短精炼，不要喧宾夺主"""

    if has_context:
        rules = base_rules + f"""

【知识库内容优先】
以下是从你的知识库文档中检索到的相关内容，这些是你的主要回答依据：
---
{context}
---

引用与标注规则：
- 基于知识库内容做出的回答，在相关句末标注来源，如 〔来源：xxx.pdf〕
- 如果多份文档内容有冲突或互补，明确指出差异并分别标注来源
- 如果知识库内容不足以完全回答问题，如实说明哪些部分来自知识库、哪些是补充

个人看法规则：
- 你可以在知识库内容之外，补充你的专业判断或实操建议
- 个人看法必须用 【个人看法】 开头，与知识库内容明确区分
- 每条个人看法控制在 2-3 句以内，不要长篇大论"""
    else:
        rules = base_rules + """

【注意】当前知识库为空，没有检索到相关文档。请基于你的专业知识回答用户问题，并在开头如实说明"知识库中暂无相关文档，以下是我的个人理解"。"""

    prompt = f"""{rules}

对话历史：
{history_text}

用户问题：{question}

请回答："""

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "你是 SalesMate，一位资深销售顾问助手。你说话自然、专业、像一位值得信赖的同事。你严格基于知识库文档回答，同时能敏锐地补充实操经验，并始终明确区分两者。"},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=15000,
    )

    answer = response.choices[0].message.content
    answer = re.sub(r"<think>.*?</think>", "", answer, flags=re.DOTALL).strip()

    history.append((question, answer))

    return {"answer": answer, "conversation_id": cid}


def chat(message: str, user_id: str, conversation_id: str | None = None) -> dict:
    context, sources = retrieve_context(message, user_id=user_id)
    result = query_llm(message, context, conversation_id)
    result["sources"] = sources
    return result


def search_knowledge_base(query: str, user_id: str, k: int = 5) -> str:
    """Search KB for relevant content. Returns formatted prompt-ready string or empty string on failure."""
    try:
        context, _ = retrieve_context(query, user_id=user_id, k=k)
        if not context.strip():
            return ""
        return f"""
【知识库匹配内容】
以下是从知识库中检索到的相关文档内容，请优先参考这些材料进行分析和生成。
如果内容与当前场景不相关，则基于你的专业知识生成。

{context}
"""
    except Exception:
        return ""
