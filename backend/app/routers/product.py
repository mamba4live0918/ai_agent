import math
import uuid
from datetime import datetime, timedelta
import random

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
import csv
import io

from ..database import get_db
from ..models.product import Product
from ..schemas.product import ProductCreate, ProductResponse, ProductListResponse

router = APIRouter()


def _generate_nav_history(expected_return: float) -> list[dict]:
    nav = 1.0
    history = []
    base_date = datetime.utcnow().replace(day=1) - timedelta(days=365)
    monthly_return = expected_return / 100 / 12
    for i in range(12):
        noise = random.uniform(-0.04, 0.04)
        nav *= (1 + monthly_return + noise)
        month_date = base_date + timedelta(days=32 * i)
        history.append({
            "date": month_date.replace(day=1).strftime("%Y-%m-%d"),
            "nav": round(nav, 4),
            "return_rate": round((nav - 1.0) * 100, 2),
        })
    return history


@router.get("", response_model=ProductListResponse)
def list_products(
    type: str | None = Query(None),
    risk_level: int | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Product)
    if type:
        query = query.filter(Product.type == type)
    if risk_level is not None:
        query = query.filter(Product.risk_level == risk_level)
    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))
    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size
    items = query.order_by(Product.updated_at.desc()).offset(offset).limit(page_size).all()
    return ProductListResponse(
        items=[ProductResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=ProductResponse, status_code=201)
def create_product(data: ProductCreate, db: Session = Depends(get_db)):
    product = Product(
        name=data.name,
        type=data.type,
        risk_level=data.risk_level,
        expected_return=data.expected_return,
        min_investment=data.min_investment,
        description=data.description,
        issuer=data.issuer,
        target_tags=data.target_tags,
        lock_period=data.lock_period,
        nav_history=_generate_nav_history(data.expected_return),
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return ProductResponse.model_validate(product)


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: uuid.UUID, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductResponse.model_validate(product)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(product_id: uuid.UUID, data: ProductCreate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.name = data.name
    product.type = data.type
    product.risk_level = data.risk_level
    product.expected_return = data.expected_return
    product.min_investment = data.min_investment
    product.description = data.description
    product.issuer = data.issuer
    product.target_tags = data.target_tags
    product.lock_period = data.lock_period
    db.commit()
    db.refresh(product)
    return ProductResponse.model_validate(product)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: uuid.UUID, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()


@router.post("/batch", response_model=ProductListResponse, status_code=201)
async def import_products_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("gbk", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    products = []
    for row_num, row in enumerate(reader, start=1):
        try:
            product = Product(
                name=row["name"].strip(),
                type=row["type"].strip(),
                risk_level=int(row["risk_level"]),
                expected_return=float(row["expected_return"]),
                min_investment=float(row["min_investment"]),
                description=row.get("description", "").strip() or None,
                issuer=row.get("issuer", "").strip() or None,
                target_tags=[t.strip() for t in row.get("target_tags", "").split(",") if t.strip()] if row.get("target_tags", "").strip() else None,
                lock_period=row.get("lock_period", "").strip() or None,
                nav_history=_generate_nav_history(float(row["expected_return"])),
            )
            db.add(product)
            db.flush()
            products.append(product)
        except (KeyError, ValueError) as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Row {row_num}: {str(e)}")

    db.commit()
    for p in products:
        db.refresh(p)

    return ProductListResponse(
        items=[ProductResponse.model_validate(p) for p in products],
        total=len(products),
        page=1,
        page_size=len(products),
        total_pages=1,
    )
