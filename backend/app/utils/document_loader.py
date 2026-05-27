import os
import pandas as pd
from langchain_community.document_loaders import (
    PyMuPDFLoader,
    TextLoader,
    Docx2txtLoader,
    UnstructuredPowerPointLoader,
    UnstructuredWordDocumentLoader,
)
from langchain_core.documents import Document as LCDocument


EXTENSION_LOADERS = {
    ".pdf": PyMuPDFLoader,
    ".txt": TextLoader,
    ".doc": UnstructuredWordDocumentLoader,
    ".docx": Docx2txtLoader,
    ".md": TextLoader,
    ".ppt": UnstructuredPowerPointLoader,
    ".pptx": UnstructuredPowerPointLoader,
}

EXCEL_EXTENSIONS = {".xlsx", ".xls", ".xlsm", ".csv"}


def _load_excel(filepath: str) -> list:
    """Load Excel/CSV file and return LangChain Document objects (one per sheet)."""
    ext = os.path.splitext(filepath)[1].lower()

    if ext == ".csv":
        df = pd.read_csv(filepath)
        filename = os.path.basename(filepath)
        text = df.to_csv(sep="\t", index=False, header=True)
        return [LCDocument(page_content=text, metadata={"filename": filename})]

    engine = "xlrd" if ext == ".xls" else "openpyxl"
    xls = pd.ExcelFile(filepath, engine=engine)
    docs = []
    filename = os.path.basename(filepath)
    for sheet_name in xls.sheet_names:
        df = xls.parse(sheet_name)
        lines = [df.to_csv(sep="\t", index=False, header=True)]
        text = f"Sheet: {sheet_name}\n" + "\n".join(lines)
        docs.append(LCDocument(page_content=text, metadata={"filename": filename, "sheet": sheet_name}))
    xls.close()
    return docs


def load_single_document(filepath: str) -> list:
    """Load a single document file and return LangChain Document objects."""
    ext = os.path.splitext(filepath)[1].lower()

    if ext in EXCEL_EXTENSIONS:
        return _load_excel(filepath)

    loader_cls = EXTENSION_LOADERS.get(ext)
    if loader_cls is None:
        raise ValueError(f"Unsupported file type: {ext}")

    if ext in (".txt", ".md"):
        loader = loader_cls(filepath, encoding="utf-8")
    elif ext in (".doc", ".ppt", ".pptx"):
        loader = loader_cls(filepath, mode="single")
    else:
        loader = loader_cls(filepath)

    docs = loader.load()
    filename = os.path.basename(filepath)
    for doc in docs:
        doc.metadata["filename"] = filename
    return docs


def get_content_preview(docs: list, max_chars: int = 500) -> str:
    text = " ".join(doc.page_content[:max_chars] for doc in docs)
    text = text.strip()[:max_chars]
    if not text:
        return "（此文档可能为图片扫描件，无法提取文本内容，请下载查看）"
    return text

def load_document_content(filepath: str) -> str:
    """Load full text content of a document for preview."""
    docs = load_single_document(filepath)
    return "\n\n".join(doc.page_content for doc in docs)
