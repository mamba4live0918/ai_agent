import uuid
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.knowledge import Category, Document
from ..models.user import User
from ..utils.auth import get_current_user, apply_document_filter
from ..schemas.knowledge import (
    CategoryCreate, CategoryResponse,
    DocumentResponse, DocumentListResponse,
)
from ..services.embedding_service import index_document, delete_from_chroma
from ..utils.document_loader import get_content_preview, load_single_document

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
    items = query.all()
    result = []
    for doc in items:
        cat = db.query(Category).filter(Category.id == doc.category_id).first()
        result.append(DocumentResponse(
            id=doc.id, title=doc.title, category_id=doc.category_id,
            file_type=doc.file_type, content_preview=doc.content_preview,
            chunk_count=doc.chunk_count, created_at=doc.created_at,
            category_name=cat.name if cat else None,
        ))
    return DocumentListResponse(items=result, total=total)


@router.post("/documents", response_model=DocumentResponse, status_code=201)
def upload_document(
    file: UploadFile = File(...),
    category_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".pdf", ".docx", ".txt", ".md", ".pptx"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
    file_path = os.path.join(DOCUMENTS_DIR, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    docs = load_single_document(file_path)
    preview = get_content_preview(docs)
    chunk_count = index_document(file_path, user_id=str(current_user.id))

    doc = Document(
        title=file.filename or "untitled",
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
def delete_document(doc_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = apply_document_filter(db.query(Document), Document, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    filename = os.path.basename(doc.file_path)
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    db.delete(doc)
    db.commit()
    delete_from_chroma(filename)
