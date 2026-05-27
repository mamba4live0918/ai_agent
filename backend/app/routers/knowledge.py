import uuid
import os
import shutil
from math import ceil
import pandas as pd
import mammoth
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.knowledge import Category, Document
from ..models.user import User
from ..utils.auth import get_current_user, apply_document_filter
from ..schemas.knowledge import (
    CategoryCreate, CategoryResponse,
    DocumentResponse, DocumentListResponse, DocumentContentResponse, TableData,
)
from ..services.embedding_service import index_document, delete_from_chroma
from ..services.audit_service import log_action
from ..utils.document_loader import get_content_preview, load_single_document, load_document_content

router = APIRouter()

DOCUMENTS_DIR = "./documents"


# ── Categories ──────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).order_by(Category.sort_order).all()
    result = []
    for cat in categories:
        doc_count = db.query(func.count(Document.id)).filter(Document.category_id == cat.id).scalar()
        result.append(CategoryResponse(
            id=cat.id, name=cat.name, description=cat.description,
            icon=cat.icon, sort_order=cat.sort_order, created_at=cat.created_at,
            document_count=doc_count or 0,
        ))
    return result


@router.post("/categories", response_model=CategoryResponse)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.query(Category).filter(Category.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category name already exists")
    cat = Category(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


# ── Documents ───────────────────────────────────────────

@router.get("/documents", response_model=DocumentListResponse)
def list_documents(
    category_id: uuid.UUID | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = apply_document_filter(db.query(Document), Document, current_user)
    if category_id:
        query = query.filter(Document.category_id == category_id)
    if q:
        query = query.filter(Document.title.ilike(f"%{q}%"))
    query = query.order_by(Document.created_at.desc())
    total = query.count()
    total_pages = ceil(total / page_size) if total > 0 else 1
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    result = []
    for doc in items:
        cat = db.query(Category).filter(Category.id == doc.category_id).first()
        result.append(DocumentResponse(
            id=doc.id, title=doc.title, category_id=doc.category_id,
            file_type=doc.file_type, content_preview=doc.content_preview,
            chunk_count=doc.chunk_count, created_at=doc.created_at,
            category_name=cat.name if cat else None,
        ))
    return DocumentListResponse(items=result, total=total, page=page, page_size=page_size, total_pages=total_pages)


@router.post("/documents", response_model=DocumentResponse, status_code=201)
def upload_document(
    request: Request,
    file: UploadFile = File(...),
    category_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    raw_name = file.filename or "untitled"
    try:
        raw_name = raw_name.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass

    ext = os.path.splitext(raw_name)[1].lower()
    if ext not in (".pdf", ".doc", ".docx", ".txt", ".md", ".ppt", ".pptx", ".xls", ".xlsx", ".xlsm", ".csv"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
    file_path = os.path.join(DOCUMENTS_DIR, raw_name)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    docs = load_single_document(file_path)
    preview = get_content_preview(docs)
    chunk_count = index_document(file_path, user_id=str(current_user.id))

    doc = Document(
        title=raw_name,
        category_id=cat.id,
        file_path=file_path,
        file_type=ext.lstrip("."),
        content_preview=preview,
        chunk_count=chunk_count,
        user_id=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    log_action(
        db,
        user_id=current_user.id,
        action="document_upload",
        resource_type="document",
        resource_id=str(doc.id),
        ip_address=request.client.host if request.client else None,
        detail=f"Uploaded: {doc.title} ({doc.file_type})",
    )

    return DocumentResponse(
        id=doc.id, title=doc.title, category_id=doc.category_id,
        file_type=doc.file_type, content_preview=doc.content_preview,
        chunk_count=doc.chunk_count, created_at=doc.created_at,
        category_name=cat.name,
    )


@router.get("/documents/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = apply_document_filter(db.query(Document), Document, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    cat = db.query(Category).filter(Category.id == doc.category_id).first()
    return DocumentResponse(
        id=doc.id, title=doc.title, category_id=doc.category_id,
        file_type=doc.file_type, content_preview=doc.content_preview,
        chunk_count=doc.chunk_count, created_at=doc.created_at,
        category_name=cat.name if cat else None,
    )


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: uuid.UUID, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = apply_document_filter(db.query(Document), Document, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    filename = os.path.basename(doc.file_path)
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    db.delete(doc)
    db.commit()
    delete_from_chroma(filename)
    log_action(
        db,
        user_id=current_user.id,
        action="document_delete",
        resource_type="document",
        resource_id=str(doc_id),
        ip_address=request.client.host if request.client else None,
        detail=f"Deleted: {filename}",
    )


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: uuid.UUID, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = apply_document_filter(db.query(Document), Document, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    media_types = {
        "pdf": "application/pdf",
        "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ppt": "application/vnd.ms-powerpoint",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xls": "application/vnd.ms-excel",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
        "csv": "text/csv",
        "txt": "text/plain",
        "md": "text/markdown",
    }
    media_type = media_types.get(doc.file_type, "application/octet-stream")
    inline = request.query_params.get("inline", "").lower() == "true"
    if inline:
        return FileResponse(doc.file_path, media_type=media_type)
    return FileResponse(doc.file_path, media_type=media_type, filename=doc.title)


@router.get("/documents/{doc_id}/content", response_model=DocumentContentResponse, response_model_exclude_none=False)
def get_document_content(doc_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = apply_document_filter(db.query(Document), Document, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    try:
        content = load_document_content(doc.file_path)
    except Exception:
        content = ""
    if not content or not content.strip():
        content = doc.content_preview or "（此文档为图片扫描件或无法提取文本内容，请下载后查看）"

    # Extract table data for spreadsheet files
    table = None
    if doc.file_type in ("xlsx", "xls", "xlsm", "csv"):
        try:
            if doc.file_type == "csv":
                df = pd.read_csv(doc.file_path, nrows=100)
            else:
                engine = "xlrd" if doc.file_type == "xls" else "openpyxl"
                df = pd.read_excel(doc.file_path, engine=engine, nrows=100)
            df = df.fillna("").astype(str)
            columns = df.columns.tolist()
            rows = [row.tolist() for _, row in df.iterrows()]
            table = TableData(columns=columns, rows=rows)
        except Exception:
            pass

    # Convert Word docs to HTML for rich preview (images, tables, formatting)
    html = None
    if doc.file_type in ("docx", "doc"):
        try:
            with open(doc.file_path, "rb") as f:
                result = mammoth.convert_to_html(f)
                html = result.value
        except Exception:
            pass

    return DocumentContentResponse(title=doc.title, file_type=doc.file_type, content=content, html=html, table=table)
