import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.customer import Customer
from ..schemas.customer import (
    CustomerCreate, CustomerAnalyzeRequest, CustomerAnalyzeResponse,
    CustomerResponse, CustomerListResponse,
)
from ..services.customer_service import analyze_customer, generate_presales_prep

router = APIRouter()


@router.get("", response_model=CustomerListResponse)
def list_customers(
    q: str | None = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Customer)
    if q:
        query = query.filter(Customer.name.ilike(f"%{q}%"))
    query = query.order_by(Customer.updated_at.desc())
    total = query.count()
    items = query.all()
    return CustomerListResponse(
        items=[CustomerResponse.model_validate(item) for item in items],
        total=total,
    )


@router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    customer = Customer(
        name=data.name,
        raw_input=data.raw_input,
        structured_data=data.structured_data,
        ai_profile=data.ai_profile,
        scores=data.scores,
        presales_prep=data.presales_prep,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.post("/analyze", response_model=CustomerAnalyzeResponse)
def analyze_customer_text(data: CustomerAnalyzeRequest):
    result = analyze_customer(data.raw_text)
    return CustomerAnalyzeResponse(**result)


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: uuid.UUID, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: uuid.UUID, data: CustomerCreate, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
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
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.post("/{customer_id}/presales-prep", response_model=CustomerResponse)
def create_presales_prep(customer_id: uuid.UUID, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    customer_data = {
        "structured_data": customer.structured_data,
        "ai_profile": customer.ai_profile,
        "scores": customer.scores,
    }
    result = generate_presales_prep(customer_data)
    customer.presales_prep = result
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: uuid.UUID, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()
