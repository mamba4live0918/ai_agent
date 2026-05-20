import os
from langchain_community.document_loaders import (
    PyMuPDFLoader,
    TextLoader,
    UnstructuredWordDocumentLoader,
    UnstructuredMarkdownLoader,
    UnstructuredPowerPointLoader,
)


EXTENSION_LOADERS = {
    ".pdf": PyMuPDFLoader,
    ".txt": TextLoader,
    ".docx": UnstructuredWordDocumentLoader,
    ".md": UnstructuredMarkdownLoader,
    ".pptx": UnstructuredPowerPointLoader,
}


def load_single_document(filepath: str) -> list:
    """Load a single document file and return LangChain Document objects."""
    ext = os.path.splitext(filepath)[1].lower()
    loader_cls = EXTENSION_LOADERS.get(ext)
    if loader_cls is None:
        raise ValueError(f"Unsupported file type: {ext}")

    if ext == ".txt":
        loader = loader_cls(filepath, encoding="utf-8")
    else:
        loader = loader_cls(filepath)

    docs = loader.load()
    filename = os.path.basename(filepath)
    for doc in docs:
        doc.metadata["filename"] = filename
    return docs


def get_content_preview(docs: list, max_chars: int = 500) -> str:
    text = " ".join(doc.page_content[:max_chars] for doc in docs)
    return text[:max_chars]
