import copy
import math
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.customer import Customer
from ..models.product import Product
from ..models.user import User
from ..utils.auth import get_current_user, apply_user_filter
from ..utils.crypto import encrypt_string, decrypt_string
from ..services.audit_service import log_action
from ..schemas.customer import (
    CustomerCreate, CustomerAnalyzeRequest, CustomerAnalyzeResponse,
    CustomerResponse, CustomerListResponse, AllocationPlanSave,
    RegenerateProfileRequest,
)
from ..services.customer_service import analyze_customer, generate_presales_prep
from ..services.allocation_service import generate_allocation_plan

router = APIRouter()


def _encrypt_customer(c: Customer):
    """Encrypt sensitive fields in-place before DB write."""
    if c.raw_input:
        c.raw_input = encrypt_string(c.raw_input)


def _decrypt_customer(c: Customer):
    """Decrypt sensitive fields in-place after DB read. Safe to call on plaintext."""
    if c.raw_input:
        try:
            c.raw_input = decrypt_string(c.raw_input)
        except Exception:
            pass


def _get_customer(customer_id: uuid.UUID, db: Session, current_user: User) -> Customer | None:
    """Fetch a customer by ID with user filtering. Caller must decrypt before returning to client."""
    return apply_user_filter(db.query(Customer), Customer, current_user).filter(Customer.id == customer_id).first()


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
    for item in items:
        _decrypt_customer(item)
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
    _encrypt_customer(customer)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    _decrypt_customer(customer)
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
    customer = _get_customer(customer_id, db, current_user)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not customer.raw_input:
        raise HTTPException(status_code=400, detail="Customer has no raw_input to re-analyze")

    _decrypt_customer(customer)  # Decrypt for LLM analysis
    edited_sd = data.structured_data if data else None
    merged_sd = {**(customer.structured_data or {}), **(edited_sd or {})}
    result = analyze_customer(customer.raw_input, user_id=str(current_user.id), edited_structured_data=merged_sd)
    customer.name = result.get("name", customer.name)
    customer.structured_data = result.get("structured_data", customer.structured_data)
    customer.ai_profile = result.get("ai_profile", customer.ai_profile)
    customer.scores = result.get("scores", customer.scores)
    _encrypt_customer(customer)  # Re-encrypt before storing
    db.commit()
    db.refresh(customer)
    _decrypt_customer(customer)  # Decrypt for response
    return CustomerResponse.model_validate(customer)


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = _get_customer(customer_id, db, current_user)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    _decrypt_customer(customer)
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: uuid.UUID, data: CustomerCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = _get_customer(customer_id, db, current_user)
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
    _decrypt_customer(customer)
    return CustomerResponse.model_validate(customer)


@router.post("/{customer_id}/presales-prep", response_model=CustomerResponse)
def create_presales_prep(customer_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = _get_customer(customer_id, db, current_user)
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
    _decrypt_customer(customer)
    return CustomerResponse.model_validate(customer)


@router.post("/{customer_id}/allocation-plan", response_model=CustomerResponse)
def create_allocation_plan(customer_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = _get_customer(customer_id, db, current_user)
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
    _decrypt_customer(customer)
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}/allocation-plan", response_model=CustomerResponse)
def save_allocation_plan(
    customer_id: uuid.UUID,
    data: AllocationPlanSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = _get_customer(customer_id, db, current_user)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not customer.allocation_plan:
        raise HTTPException(status_code=400, detail="No allocation plan exists — generate one first")

    customer.allocation_plan["user_plan"] = data.user_plan
    if data.total_investable is not None:
        customer.allocation_plan["total_investable"] = data.total_investable
    db.commit()
    db.refresh(customer)
    _decrypt_customer(customer)
    return CustomerResponse.model_validate(customer)


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: uuid.UUID, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = _get_customer(customer_id, db, current_user)
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
