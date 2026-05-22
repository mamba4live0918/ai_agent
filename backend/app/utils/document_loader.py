import os
import tempfile
from langchain_community.document_loaders import (
    PyMuPDFLoader,
    TextLoader,
    Docx2txtLoader,
    UnstructuredPowerPointLoader,
)
from .crypto import decrypt_bytes


EXTENSION_LOADERS = {
    ".pdf": PyMuPDFLoader,
    ".txt": TextLoader,
    ".docx": Docx2txtLoader,
    ".md": TextLoader,
    ".pptx": UnstructuredPowerPointLoader,
}

ENC_MAGIC = b"ENC1"


def _read_file_bytes(filepath: str) -> bytes:
    """Read file, auto-decrypting if it has the ENC1 magic header."""
    with open(filepath, "rb") as f:
        data = f.read()
    if data[:4] == ENC_MAGIC:
        return decrypt_bytes(data[4:])
    return data


def _decrypted_tempfile(filepath: str) -> str:
    """If the file is encrypted, create a decrypted temp copy and return its path.
    If not encrypted, return the original path."""
    with open(filepath, "rb") as f:
        header = f.read(4)
    if header != ENC_MAGIC:
        return filepath
    # Encrypted: decrypt to temp file
    with open(filepath, "rb") as f:
        f.read(4)  # skip magic
        encrypted = f.read()
    decrypted = decrypt_bytes(encrypted)
    suffix = os.path.splitext(filepath)[1]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(decrypted)
    tmp.close()
    return tmp.name


def load_single_document(filepath: str) -> list:
    """Load a single document file and return LangChain Document objects.
    Handles both encrypted (ENC1 header) and plaintext files."""
    ext = os.path.splitext(filepath)[1].lower()
    loader_cls = EXTENSION_LOADERS.get(ext)
    if loader_cls is None:
        raise ValueError(f"Unsupported file type: {ext}")

    # Use temp file for encrypted, direct path for plaintext
    load_path = _decrypted_tempfile(filepath)
    try:
        if ext in (".txt", ".md"):
            loader = loader_cls(load_path, encoding="utf-8")
        else:
            loader = loader_cls(load_path)

        docs = loader.load()
        filename = os.path.basename(filepath)
        for doc in docs:
            doc.metadata["filename"] = filename
        return docs
    finally:
        # Clean up temp file if it was created
        if load_path != filepath:
            os.unlink(load_path)


def get_content_preview(docs: list, max_chars: int = 500) -> str:
    text = " ".join(doc.page_content[:max_chars] for doc in docs)
    return text[:max_chars]
