import copy
import csv
import io
import math
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.customer import Customer
from ..models.product import Product
from ..models.user import User
from ..utils.auth import get_current_user, apply_user_filter
from ..services.audit_service import log_action
from ..schemas.customer import (
    CustomerCreate, CustomerAnalyzeRequest, CustomerAnalyzeResponse,
    CustomerResponse, CustomerListResponse, AllocationPlanSave,
    RegenerateProfileRequest,
)
from ..services.customer_service import analyze_customer, generate_presales_prep
from ..services.allocation_service import generate_allocation_plan

router = APIRouter()


@router.get("", response_model=CustomerListResponse)
def list_customers(
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = apply_user_filter(db.query(Customer), Customer, current_user)
    if q:
        query = query.filter(Customer.name.ilike(f"%{q}%"))
    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size
    items = query.order_by(Customer.updated_at.desc()).offset(offset).limit(page_size).all()
    return CustomerListResponse(
        items=[CustomerResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(data: CustomerCreate, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = Customer(
        name=data.name,
        raw_input=data.raw_input,
        structured_data=data.structured_data,
        ai_profile=data.ai_profile,
        scores=data.scores,
        presales_prep=data.presales_prep,
        allocation_plan=data.allocation_plan,
        user_id=current_user.id,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    log_action(
        db,
        user_id=current_user.id,
        action="customer_create",
        resource_type="customer",
        resource_id=str(customer.id),
        ip_address=request.client.host if request.client else None,
        detail=f"Created customer: {customer.name}",
    )
    return CustomerResponse.model_validate(customer)


@router.post("/analyze", response_model=CustomerAnalyzeResponse)
def analyze_customer_text(data: CustomerAnalyzeRequest, current_user: User = Depends(get_current_user)):
    result = analyze_customer(data.raw_text, user_id=str(current_user.id))
    return CustomerAnalyzeResponse(**result)


@router.post("/{customer_id}/regenerate-profile", response_model=CustomerResponse)
def regenerate_customer_profile(
    customer_id: uuid.UUID,
    data: RegenerateProfileRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = apply_user_filter(db.query(Customer), Customer, current_user).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    edited_sd = data.structured_data if data else None
    merged_sd = {**(customer.structured_data or {}), **(edited_sd or {})}

    raw_input = customer.raw_input
    if not raw_input or raw_input.startswith("CSV导入"):
        # Build description from structured_data when no proper raw_input
        sd = customer.structured_data or {}
        parts = [customer.name]
        for k, label in [("age","岁"), ("gender",""), ("occupation",""), ("industry","行业"),
                         ("annual_income_range","年收入"), ("total_asset_range","总资产"),
                         ("risk_preference","风险偏好"), ("investment_years","投资经验")]:
            v = sd.get(k, "")
            if v and v != "未知":
                parts.append(f"{v}{label}")
        raw_input = "，".join(parts) if len(parts) > 1 else customer.name

    result = analyze_customer(raw_input, user_id=str(current_user.id), edited_structured_data=merged_sd)
    customer.name = result.get("name", customer.name)
    customer.structured_data = result.get("structured_data", customer.structured_data)
    customer.ai_profile = result.get("ai_profile", customer.ai_profile)
    customer.scores = result.get("scores", customer.scores)
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = apply_user_filter(db.query(Customer), Customer, current_user).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: uuid.UUID, data: CustomerCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = apply_user_filter(db.query(Customer), Customer, current_user).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer.name = data.name
    customer.raw_input = data.raw_input
    if data.structured_data is not None:
        customer.structured_data = data.structured_data
    if data.ai_profile is not None:
        customer.ai_profile = data.ai_profile
    if data.scores is not None:
        customer.scores = data.scores
    if data.presales_prep is not None:
        customer.presales_prep = data.presales_prep
    if data.allocation_plan is not None:
        customer.allocation_plan = data.allocation_plan
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.post("/{customer_id}/presales-prep", response_model=CustomerResponse)
def create_presales_prep(customer_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = apply_user_filter(db.query(Customer), Customer, current_user).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    customer_data = {
        "structured_data": customer.structured_data,
        "ai_profile": customer.ai_profile,
        "scores": customer.scores,
    }
    result = generate_presales_prep(customer_data, user_id=str(current_user.id))
    customer.presales_prep = result
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.post("/{customer_id}/allocation-plan", response_model=CustomerResponse)
def create_allocation_plan(customer_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = apply_user_filter(db.query(Customer), Customer, current_user).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    products = apply_document_filter(db.query(Product), Product, current_user).all()
    if not products:
        raise HTTPException(status_code=400, detail="No products in library — add products first")

    products_data = [
        {
            "id": str(p.id),
            "name": p.name,
            "type": p.type,
            "risk_level": p.risk_level,
            "expected_return": p.expected_return,
            "min_investment": p.min_investment,
            "description": p.description or "",
            "lock_period": p.lock_period or "",
        }
        for p in products
    ]

    client_data = {
        "structured_data": customer.structured_data or {},
        "ai_profile": customer.ai_profile or {},
        "scores": customer.scores or {},
    }

    result = generate_allocation_plan(client_data, products_data, user_id=str(current_user.id))
    ai_plan = result

    # Enrich allocations with product_name from the DB product lookup
    product_name_map = {str(p.id): p.name for p in products}
    if "error" not in ai_plan:
        for plan_key in ("conservative", "balanced", "aggressive"):
            plan = ai_plan.get(plan_key)
            if plan and "allocations" in plan:
                for alloc in plan["allocations"]:
                    pid = alloc.get("product_id", "")
                    alloc["product_name"] = product_name_map.get(pid, "未知产品")

    allocation_plan = {
        "total_investable": ai_plan.get("total_investable") if isinstance(ai_plan, dict) else None,
        "ai_plan": copy.deepcopy(ai_plan),
        "user_plan": copy.deepcopy(ai_plan),
        "generated_at": datetime.utcnow().isoformat(),
    }

    customer.allocation_plan = allocation_plan
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}/allocation-plan", response_model=CustomerResponse)
def save_allocation_plan(
    customer_id: uuid.UUID,
    data: AllocationPlanSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = apply_user_filter(db.query(Customer), Customer, current_user).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not customer.allocation_plan:
        raise HTTPException(status_code=400, detail="No allocation plan exists — generate one first")

    customer.allocation_plan["user_plan"] = data.user_plan
    if data.total_investable is not None:
        customer.allocation_plan["total_investable"] = data.total_investable
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.post("/import-csv", status_code=201)
def import_customers_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import customers from CSV. First row must be headers matching structured_data field keys.
    The 'name' column is required. All other columns go into structured_data."""
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = file.file.read()
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('gbk', errors='replace')

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV is empty or has no headers")

    created = []
    errors = []
    for i, row in enumerate(reader, start=2):
        name = row.pop('name', '').strip() if 'name' in row else ''
        if not name:
            errors.append(f"Row {i}: missing 'name' column, skipped")
            continue

        structured_data = {}
        for key, val in row.items():
            val = val.strip() if val else ''
            if val:
                structured_data[key] = val

        customer = Customer(
            name=name,
            raw_input=f"CSV导入: {name}",
            structured_data=structured_data,
            user_id=current_user.id,
        )
        db.add(customer)
        created.append(name)

    db.commit()
    return {"imported": len(created), "names": created, "errors": errors}


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: uuid.UUID, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = apply_user_filter(db.query(Customer), Customer, current_user).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()
    log_action(
        db,
        user_id=current_user.id,
        action="customer_delete",
        resource_type="customer",
        resource_id=str(customer_id),
        ip_address=request.client.host if request.client else None,
        detail=f"Deleted customer: {customer.name}",
    )
