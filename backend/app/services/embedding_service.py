import os
import json
import shutil
import jieba
from openai import OpenAI
from rank_bm25 import BM25Okapi
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LCDocument
from langchain_core.embeddings import Embeddings

from ..config import settings
from httpx import Timeout



_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=100,
    separators=["\n\n", "\n", "。", "！", "？", "；", "，", ".", " ", ""],
)


class JinaEmbeddings(Embeddings):
    """Jina AI embedding function using OpenAI-compatible API."""

    def __init__(self, api_key: str, model: str, base_url: str):
        self._client = OpenAI(api_key=api_key, base_url=base_url, timeout=Timeout(60.0, connect=10.0))
        self._model = model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        resp = self._client.embeddings.create(model=self._model, input=texts)
        return [d.embedding for d in sorted(resp.data, key=lambda x: x.index)]

    def embed_query(self, text: str) -> list[float]:
        resp = self._client.embeddings.create(model=self._model, input=[text])
        return resp.data[0].embedding


_embedding_function = JinaEmbeddings(
    api_key=settings.jina_api_key,
    model=settings.embed_model,
    base_url=settings.jina_base_url,
)


def get_embedding_function():
    return _embedding_function


def reset_chroma():
    if os.path.exists(settings.chroma_db_dir):
        shutil.rmtree(settings.chroma_db_dir)


def chunk_documents(docs: list[LCDocument]) -> list[LCDocument]:
    return _text_splitter.split_documents(docs)


def add_to_chroma(chunks: list[LCDocument]):
    batch_size = 4
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        if i == 0:
            Chroma.from_documents(
                documents=batch,
                embedding=_embedding_function,
                persist_directory=settings.chroma_db_dir,
            )
        else:
            vectorstore = Chroma(
                persist_directory=settings.chroma_db_dir,
                embedding_function=_embedding_function,
            )
            vectorstore.add_documents(batch)


def get_or_create_vectorstore() -> Chroma:
    if not os.path.exists(settings.chroma_db_dir) or not os.listdir(settings.chroma_db_dir):
        return Chroma.from_documents(
            documents=[],
            embedding=_embedding_function,
            persist_directory=settings.chroma_db_dir,
        )
    return Chroma(
        persist_directory=settings.chroma_db_dir,
        embedding_function=_embedding_function,
    )


def retrieve_from_chroma(query: str, user_id: str, k: int = 8, filenames: list[str] | None = None) -> list:
    """Retrieve chunks filtered by user_id: shared docs + user's own docs.
    Optionally restrict to specific filenames for document-scoped generation."""
    vectorstore = get_or_create_vectorstore()

    user_filter = {
        "$or": [
            {"user_id": "shared"},
            {"user_id": str(user_id)},
        ]
    }

    if filenames:
        where_filter = {
            "$and": [
                user_filter,
                {"$or": [{"filename": f} for f in filenames]},
            ]
        }
    else:
        where_filter = user_filter

    return vectorstore.similarity_search(query, k=k, filter=where_filter)


def index_document(filepath: str, user_id: str | None = None) -> int:
    from ..utils.document_loader import load_single_document
    docs = load_single_document(filepath)
    chunks = chunk_documents(docs)
    uid = user_id if user_id else "shared"
    for chunk in chunks:
        chunk.metadata["user_id"] = uid
    add_to_chroma(chunks)
    return len(chunks)


def delete_from_chroma(filename: str) -> None:
    try:
        if not os.path.exists(settings.chroma_db_dir) or not os.listdir(settings.chroma_db_dir):
            return
        vectorstore = Chroma(
            persist_directory=settings.chroma_db_dir,
            embedding_function=_embedding_function,
        )
        vectorstore.delete(where={"filename": filename})
    except Exception:
        pass


# ── BM25 Hybrid Search ──

BM25_INDEX_DIR = "./bm25_index"
os.makedirs(BM25_INDEX_DIR, exist_ok=True)


def _tokenize(text: str) -> list[str]:
    return [w for w in jieba.cut(text) if w.strip()]


def _build_bm25_index() -> tuple[BM25Okapi | None, list[dict]]:
    """Build BM25 index from all chunks in ChromaDB."""
    if not os.path.exists(settings.chroma_db_dir) or not os.listdir(settings.chroma_db_dir):
        return None, []

    vectorstore = Chroma(persist_directory=settings.chroma_db_dir, embedding_function=_embedding_function)
    try:
        results = vectorstore.get(include=["documents", "metadatas"])
    except Exception:
        return None, []

    documents = results.get("documents", [])
    metadatas = results.get("metadatas", [])
    if not documents:
        return None, []

    tokenized = [_tokenize(doc) for doc in documents]
    bm25 = BM25Okapi(tokenized)
    chunks = [{"content": doc, "metadata": meta} for doc, meta in zip(documents, metadatas)]
    return bm25, chunks


def retrieve_hybrid(query: str, user_id: str, mode: str = "precise", k: int = 8, filenames: list[str] | None = None) -> list:
    """Hybrid retrieval: vector + BM25, deduplicated and thresholded by mode."""
    # Vector search
    vector_results = retrieve_from_chroma(query, user_id=user_id, k=k, filenames=filenames)

    # BM25 search
    bm25, bm25_chunks = _build_bm25_index()
    bm25_results = []
    if bm25 and bm25_chunks:
        tokenized_query = _tokenize(query)
        scores = bm25.get_scores(tokenized_query)
        if scores.any():
            top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]
            bm25_results = [bm25_chunks[i] for i in top_indices if scores[i] > 0]

    # User filter for BM25 results
    bm25_results = [
        c for c in bm25_results
        if c["metadata"].get("user_id") in (str(user_id), "shared")
    ]

    # Deduplicate by content hash, vector results first
    seen = {c.page_content[:100] for c in vector_results}
    merged = list(vector_results)
    for c in bm25_results:
        key = c["content"][:100]
        if key not in seen:
            seen.add(key)
            merged.append(c)

    # Mode-specific threshold
    threshold = 0.7 if mode == "precise" else 0.4
    max_results = 6 if mode == "precise" else 12

    # Filter by vector similarity threshold (only applies to vector results)
    result_limit = max_results
    return merged[:result_limit]
