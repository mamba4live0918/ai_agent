import math
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
import csv
import io

from ..database import get_db
from ..models.product import Product
from ..models.user import User
from ..utils.auth import get_current_user, apply_document_filter
from ..schemas.product import (
    ProductCreate, ProductResponse, ProductListResponse,
    MarketSearchRequest, MarketSearchResponse, MarketFundItem,
    MarketListResponse, MarketFundBrowseItem,
)
from ..services.fund_service import fetch_fund_nav
from ..services.market_service import search_funds, fetch_fund_detail, list_market_funds

router = APIRouter()

NAV_REFRESH_HOURS = 2


# ---- Market data import endpoints (akshare) ----


@router.get("/market/list", response_model=MarketListResponse)
def browse_market_funds(
    category: str = Query("all", description="all / stock / mix / bond / index / qdii / money"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Browse all market funds by category with pagination. ~20,000 funds total."""
    result = list_market_funds(category=category, page=page, page_size=page_size)
    return MarketListResponse(
        items=[MarketFundBrowseItem(**r) for r in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        total_pages=result["total_pages"],
    )


@router.post("/market/search", response_model=MarketSearchResponse)
def search_market_funds(
    data: MarketSearchRequest,
    current_user: User = Depends(get_current_user),
):
    """Search real market funds by keyword (name or fund code) via akshare."""
    results = search_funds(data.keyword, data.limit)
    return MarketSearchResponse(
        items=[MarketFundItem(**r) for r in results]
    )


@router.post("/market/save", response_model=ProductResponse, status_code=201)
def save_market_product(
    fund_code: str = Query(..., min_length=6, max_length=6),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch market data AND save the product to database in one call."""
    existing = apply_document_filter(
        db.query(Product), Product, current_user
    ).filter(Product.fund_code == fund_code).first()
    if existing:
        _maybe_refresh_nav(existing)
        db.commit()
        db.refresh(existing)
        return ProductResponse.model_validate(existing)

    detail = fetch_fund_detail(fund_code)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Fund {fund_code} not found in market data")

    product = Product(
        name=detail["name"],
        type=detail["type"],
        risk_level=detail["risk_level"],
        expected_return=detail["expected_return"],
        min_investment=detail["min_investment"],
        description=detail.get("description"),
        issuer=detail.get("issuer"),
        fund_code=fund_code,
        nav_history=detail.get("nav_history"),
        source=detail["source"],
        nav_updated_at=datetime.utcnow() if detail.get("nav_history") else None,
        user_id=None if current_user.role == "admin" else current_user.id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return ProductResponse.model_validate(product)


# ---- CRUD endpoints ----


def _maybe_refresh_nav(product: Product) -> bool:
    """Re-fetch NAV from East Money if fund_code is set and NAV is older than NAV_REFRESH_HOURS.
    Returns True if refreshed, False otherwise."""
    if not product.fund_code:
        return False
    now = datetime.utcnow()
    if product.nav_updated_at and (now - product.nav_updated_at) < timedelta(hours=NAV_REFRESH_HOURS):
        return False
    nav_history = fetch_fund_nav(product.fund_code)
    if nav_history:
        product.nav_history = nav_history
        product.source = "eastmoney"
        product.nav_updated_at = now
        return True
    return False


@router.get("", response_model=ProductListResponse)
def list_products(
    type: str | None = Query(None),
    risk_level: int | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: str = Query("updated_at", description="name / expected_return / risk_level / updated_at / min_investment"),
    sort_order: str = Query("desc", description="asc or desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = apply_document_filter(db.query(Product), Product, current_user)
    if type:
        query = query.filter(Product.type == type)
    if risk_level is not None:
        query = query.filter(Product.risk_level == risk_level)
    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))
    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size

    # Dynamic sorting
    sort_col = getattr(Product, sort_by, Product.updated_at)
    if sort_order == "asc":
        items = query.order_by(sort_col.asc()).offset(offset).limit(page_size).all()
    else:
        items = query.order_by(sort_col.desc()).offset(offset).limit(page_size).all()
    return ProductListResponse(
        items=[ProductResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=ProductResponse, status_code=201)
def create_product(data: ProductCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    nav_history = None
    source = "manual"
    nav_updated_at = None
    if data.fund_code:
        nav_history = fetch_fund_nav(data.fund_code)
        if nav_history:
            source = "eastmoney"
            nav_updated_at = datetime.utcnow()

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
        fund_code=data.fund_code,
        nav_history=nav_history,
        source=source,
        nav_updated_at=nav_updated_at,
        user_id=None if current_user.role == "admin" else current_user.id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return ProductResponse.model_validate(product)


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = apply_document_filter(db.query(Product), Product, current_user).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    refreshed = _maybe_refresh_nav(product)
    if refreshed:
        db.commit()
        db.refresh(product)
    return ProductResponse.model_validate(product)


@router.post("/{product_id}/refresh-nav", response_model=ProductResponse)
def refresh_product_nav(product_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = apply_document_filter(db.query(Product), Product, current_user).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.fund_code:
        raise HTTPException(status_code=400, detail="Product has no fund code")
    nav_history = fetch_fund_nav(product.fund_code)
    if nav_history:
        product.nav_history = nav_history
        product.source = "eastmoney"
        product.nav_updated_at = datetime.utcnow()
        db.commit()
        db.refresh(product)
    return ProductResponse.model_validate(product)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(product_id: uuid.UUID, data: ProductCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = apply_document_filter(db.query(Product), Product, current_user).filter(Product.id == product_id).first()
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
    product.fund_code = data.fund_code
    if data.fund_code:
        nav = fetch_fund_nav(data.fund_code)
        if nav:
            product.nav_history = nav
            product.source = "eastmoney"
            product.nav_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(product)
    return ProductResponse.model_validate(product)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = apply_document_filter(db.query(Product), Product, current_user).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()


@router.post("/batch", response_model=ProductListResponse, status_code=201)
async def import_products_csv(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
            fund_code = row.get("fund_code", "").strip() or None
            nav_history = None
            source = "manual"
            nav_updated_at = None
            if fund_code:
                nav_history = fetch_fund_nav(fund_code)
                if nav_history:
                    source = "eastmoney"
                    nav_updated_at = datetime.utcnow()

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
                fund_code=fund_code,
                nav_history=nav_history,
                source=source,
                nav_updated_at=nav_updated_at,
                user_id=None if current_user.role == "admin" else current_user.id,
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
