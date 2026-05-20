import os
import shutil
from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LCDocument

from ..config import settings


_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=2000,
    chunk_overlap=400,
    separators=["\n\n", "\n", ". ", " ", ""],
)

_embedding_function = OllamaEmbeddings(model=settings.embed_model)


def get_embedding_function():
    return _embedding_function


def reset_chroma():
    if os.path.exists(settings.chroma_db_dir):
        shutil.rmtree(settings.chroma_db_dir)


def chunk_documents(docs: list[LCDocument]) -> list[LCDocument]:
    return _text_splitter.split_documents(docs)


def add_to_chroma(chunks: list[LCDocument]):
    Chroma.from_documents(
        documents=chunks,
        embedding=_embedding_function,
        persist_directory=settings.chroma_db_dir,
    )


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


def index_document(filepath: str) -> int:
    from ..utils.document_loader import load_single_document
    docs = load_single_document(filepath)
    chunks = chunk_documents(docs)
    add_to_chroma(chunks)
    return len(chunks)
