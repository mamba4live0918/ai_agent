import re
from openai import OpenAI

from ..config import settings
from .embedding_service import get_or_create_vectorstore

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


def retrieve_context(query: str, k: int = 8) -> tuple[str, list[dict]]:
    vectorstore = get_or_create_vectorstore()
    docs = vectorstore.similarity_search(query, k=k)

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

    prompt = f"""You are an advanced AI knowledge base assistant for sales professionals.
Your job is to synthesize information across multiple documents.

Rules:
- Use only provided context
- Compare information across files
- Explain relationships
- Summarize intelligently
- Avoid hallucinations
- Answer in Chinese unless the user asks in English

Conversation History:
{history_text}

Question: {question}

Retrieved Context:
{context}

Provide:
1. Direct answer
2. Detailed explanation
3. Cross-document insights
4. Important relationships"""

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "You are an expert sales knowledge assistant with strong reasoning ability."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=15000,
    )

    answer = response.choices[0].message.content
    answer = re.sub(r"<think>.*?</think>", "", answer, flags=re.DOTALL).strip()

    history.append((question, answer))

    return {"answer": answer, "conversation_id": cid}


def chat(message: str, conversation_id: str | None = None) -> dict:
    context, sources = retrieve_context(message)
    result = query_llm(message, context, conversation_id)
    result["sources"] = sources
    return result
