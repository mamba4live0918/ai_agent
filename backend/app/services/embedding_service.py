import os
import shutil
from openai import OpenAI
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LCDocument
from langchain_core.embeddings import Embeddings

from ..config import settings



_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=100,
    separators=["\n\n", "\n", "。", "！", "？", "；", "，", ".", " ", ""],
)


class JinaEmbeddings(Embeddings):
    """Jina AI embedding function using OpenAI-compatible API."""

    def __init__(self, api_key: str, model: str, base_url: str):
        self._client = OpenAI(api_key=api_key, base_url=base_url)
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
