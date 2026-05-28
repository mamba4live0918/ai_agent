import uuid
import os
import shutil
from math import ceil
import pandas as pd
import mammoth
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.knowledge import Category, Document, document_categories
from ..models.user import User
from ..utils.auth import get_current_user, apply_document_filter, decode_access_token, decode_access_token
from ..schemas.knowledge import (
    CategoryCreate, CategoryResponse,
    DocumentResponse, DocumentListResponse, DocumentContentResponse, TableData,
    DocumentUpdateCategories,
)
from ..services.embedding_service import index_document, delete_from_chroma
from ..services.audit_service import log_action
from ..utils.document_loader import get_content_preview, load_single_document, load_document_content

router = APIRouter()

DOCUMENTS_DIR = "./documents"
CATEGORY_ICONS_DIR = "./category_icons"


def _doc_to_response(doc: Document, db: Session) -> DocumentResponse:
    """Build a DocumentResponse with category_ids and category_names from junction table."""
    cat_ids = [
        row.category_id for row in
        db.execute(document_categories.select().where(document_categories.c.document_id == doc.id)).fetchall()
    ]
    cat_names: list[str] = []
    if cat_ids:
        cats = db.query(Category).filter(Category.id.in_(cat_ids)).all()
        cat_map = {c.id: c.name for c in cats}
        cat_names = [cat_map[cid] for cid in cat_ids if cid in cat_map]
    return DocumentResponse(
        id=doc.id, title=doc.title, category_ids=cat_ids,
        file_type=doc.file_type, content_preview=doc.content_preview,
        chunk_count=doc.chunk_count, is_archived=doc.is_archived,
        created_at=doc.created_at,
        category_names=cat_names,
    )


def _set_document_categories(doc_id: uuid.UUID, category_ids: list[uuid.UUID], db: Session):
    """Replace all category assignments for a document."""
    db.execute(document_categories.delete().where(document_categories.c.document_id == doc_id))
    if category_ids:
        # Update the primary category_id on the document to the first one
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.category_id = category_ids[0]
        for cid in category_ids:
            db.execute(document_categories.insert().values(document_id=doc_id, category_id=cid))
    else:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.category_id = None


# ── Categories ──────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).order_by(Category.sort_order).all()
    result = []
    for cat in categories:
        from sqlalchemy import select
        doc_count = db.execute(
            select(func.count()).where(document_categories.c.category_id == cat.id)
        ).scalar()
        children_count = db.execute(
            select(func.count()).where(Category.parent_id == cat.id)
        ).scalar()
        result.append(CategoryResponse(
            id=cat.id, name=cat.name, description=cat.description,
            icon=cat.icon, sort_order=cat.sort_order, created_at=cat.created_at,
            document_count=doc_count or 0,
            parent_id=cat.parent_id,
            children_count=children_count or 0,
        ))
    return result


@router.post("/categories", response_model=CategoryResponse)
def create_category(data: CategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(Category).filter(Category.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category name already exists")
    if data.parent_id is not None:
        parent = db.query(Category).filter(Category.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Parent category not found")
    cat = Category(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(cat_id: uuid.UUID, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    # Promote children to the deleted category's parent (or root)
    parent_of_deleted = cat.parent_id
    db.execute(
        Category.__table__.update()
        .where(Category.parent_id == cat_id)
        .values(parent_id=parent_of_deleted)
    )
    # Remove from junction table (cascade handles this) and set category_id=NULL on documents
    db.execute(document_categories.delete().where(document_categories.c.category_id == cat_id))
    db.execute(
        Document.__table__.update()
        .where(Document.category_id == cat_id)
        .values(category_id=None)
    )
    db.delete(cat)
    db.commit()
    log_action(
        db,
        user_id=current_user.id,
        action="category_delete",
        resource_type="category",
        resource_id=str(cat_id),
        ip_address=request.client.host if request.client else None,
        detail=f"Deleted category: {cat.name}",
    )


@router.post("/categories/{cat_id}/icon")
def upload_category_icon(cat_id: uuid.UUID, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    ext = os.path.splitext(file.filename or "icon.png")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"):
        raise HTTPException(status_code=400, detail="Unsupported image type")
    os.makedirs(CATEGORY_ICONS_DIR, exist_ok=True)
    filename = f"{cat_id}{ext}"
    filepath = os.path.join(CATEGORY_ICONS_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    cat.icon = filename
    db.commit()
    return {"icon": filename, "url": f"/api/knowledge/categories/icons/{filename}"}


@router.get("/categories/icons/{filename}")
def serve_category_icon(filename: str):
    filepath = os.path.join(CATEGORY_ICONS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Icon not found")
    ext = os.path.splitext(filename)[1].lower()
    media_types = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp"}
    return FileResponse(filepath, media_type=media_types.get(ext, "image/png"))


# ── Documents ───────────────────────────────────────────

@router.get("/documents", response_model=DocumentListResponse)
def list_documents(
    category_id: uuid.UUID | None = Query(None),
    q: str | None = Query(None),
    archived: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = apply_document_filter(db.query(Document), Document, current_user)
    query = query.filter(Document.is_archived == archived)
    if category_id:
        # Filter by junction table
        doc_ids = [
            row.document_id for row in
            db.execute(document_categories.select().where(document_categories.c.category_id == category_id)).fetchall()
        ]
        query = query.filter(Document.id.in_(doc_ids))
    if q:
        query = query.filter(Document.title.ilike(f"%{q}%"))
    query = query.order_by(Document.created_at.desc())
    total = query.count()
    total_pages = ceil(total / page_size) if total > 0 else 1
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    result = [_doc_to_response(doc, db) for doc in items]
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

    cat_uuid = uuid.UUID(category_id)
    doc = Document(
        title=raw_name,
        category_id=cat_uuid,
        file_path=file_path,
        file_type=ext.lstrip("."),
        content_preview=preview,
        chunk_count=chunk_count,
        user_id=current_user.id,
    )
    db.add(doc)
    db.flush()

    # Add to junction table
    db.execute(document_categories.insert().values(document_id=doc.id, category_id=cat_uuid))
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

    return _doc_to_response(doc, db)


@router.get("/documents/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = apply_document_filter(db.query(Document), Document, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_to_response(doc, db)


@router.put("/documents/{doc_id}/categories", response_model=DocumentResponse)
def update_document_categories(
    doc_id: uuid.UUID,
    data: DocumentUpdateCategories,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = apply_document_filter(db.query(Document), Document, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    # Validate category IDs exist
    if data.category_ids:
        existing = db.query(Category.id).filter(Category.id.in_(data.category_ids)).all()
        existing_ids = {row.id for row in existing}
        invalid = set(data.category_ids) - existing_ids
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid category IDs: {invalid}")
    _set_document_categories(doc_id, data.category_ids, db)
    db.commit()
    db.refresh(doc)
    return _doc_to_response(doc, db)


class DocumentArchiveRequest(BaseModel):
    is_archived: bool


@router.patch("/documents/{doc_id}/archive", response_model=DocumentResponse)
def archive_document(
    doc_id: uuid.UUID,
    data: DocumentArchiveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = apply_document_filter(db.query(Document), Document, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.is_archived = data.is_archived
    db.commit()
    db.refresh(doc)
    return _doc_to_response(doc, db)


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: uuid.UUID, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = apply_document_filter(db.query(Document), Document, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    filename = os.path.basename(doc.file_path)
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    # Junction table rows cascade on delete
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
def download_document(doc_id: uuid.UUID, request: Request, token: str | None = Query(None), db: Session = Depends(get_db)):
    # Accept token via query param for iframe (can't set headers), fall back to header auth
    if token:
        try:
            payload = decode_access_token(token)
            user_id = payload.get("user_id")
            if user_id:
                current_user = db.query(User).filter(User.id == user_id).first()
            else:
                raise HTTPException(status_code=401, detail="Invalid token")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    else:
        current_user = get_current_user(request, db)
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
        resp = FileResponse(doc.file_path, media_type=media_type)
        resp.headers["Content-Disposition"] = "inline"
        return resp
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
