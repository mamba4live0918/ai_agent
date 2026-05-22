import os
import shutil
import requests
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LCDocument
from langchain_core.embeddings import Embeddings

from ..config import settings


class JinaEmbeddings(Embeddings):
    def __init__(self, api_key: str, base_url: str, model: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        resp = requests.post(
            f"{self.base_url}/embeddings",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": self.model, "input": [{"text": t} for t in texts]},
        )
        if not resp.ok:
            raise RuntimeError(f"Jina embedding failed: {resp.status_code} {resp.text[:500]}")
        return [d["embedding"] for d in resp.json()["data"]]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]


_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=100,
    separators=["\n\n", "\n", "。", "！", "？", "；", "，", ".", " ", ""],
)

_embedding_function = JinaEmbeddings(
    api_key=settings.jina_api_key,
    base_url=settings.jina_base_url,
    model=settings.embed_model,
)


def get_embedding_function():
    return _embedding_function


def reset_chroma():
    if os.path.exists(settings.chroma_db_dir):
        shutil.rmtree(settings.chroma_db_dir)


def chunk_documents(docs: list[LCDocument]) -> list[LCDocument]:
    return _text_splitter.split_documents(docs)


def add_to_chroma(chunks: list[LCDocument]):
    """Add chunks to ChromaDB in small batches to avoid exceeding embedding context limits."""
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


def retrieve_from_chroma(query: str, user_id: str, k: int = 8) -> list:
    """Retrieve chunks filtered by user_id: shared docs + user's own docs."""
    vectorstore = get_or_create_vectorstore()
    where_filter = {
        "$or": [
            {"user_id": "shared"},
            {"user_id": str(user_id)},
        ]
    }
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
    """Remove all chunks belonging to a document by filename metadata."""
    try:
        if not os.path.exists(settings.chroma_db_dir) or not os.listdir(settings.chroma_db_dir):
            return
        vectorstore = Chroma(
            persist_directory=settings.chroma_db_dir,
            embedding_function=_embedding_function,
        )
        vectorstore.delete(where={"filename": filename})
    except Exception:
        pass  # Don't fail the whole delete if ChromaDB cleanup fails
