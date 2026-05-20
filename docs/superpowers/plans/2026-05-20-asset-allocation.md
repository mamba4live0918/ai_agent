# 资产配置方案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the asset allocation module — product library with simulated nav history, AI-generated three-plan allocation (conservative/balanced/aggressive) per customer, interactive ratio adjustment with slider+input, and PDF export.

**Architecture:** Reuses the proven DeepSeek prompt pipeline pattern (data → prompt → JSON parse → JSONB store). New FinancialProduct table holds shared product library with 12-month simulated nav_history. Customer table gains `allocation_plan` JSONB column storing both `ai_plan` (immutable) and `user_plan` (editable). Frontend embeds product management + plan display inside the existing "配置方案" tab of CustomerProfile.

**Tech Stack:** FastAPI + SQLAlchemy + PostgreSQL JSONB + DeepSeek API + React 19 + TypeScript + Recharts (AreaChart for nav, BarChart stacked for allocation) + PapaParse (CSV)

---

## File Map

| File | Create/Modify | Responsibility |
|------|--------------|----------------|
| `backend/app/models/product.py` | Create | FinancialProduct SQLAlchemy model |
| `backend/app/schemas/product.py` | Create | Product Pydantic request/response schemas |
| `backend/app/routers/product.py` | Create | Product CRUD + CSV batch import endpoints |
| `backend/app/services/allocation_service.py` | Create | DeepSeek prompt + allocation plan generation |
| `backend/app/models/customer.py` | Modify | + allocation_plan JSONB column |
| `backend/app/schemas/customer.py` | Modify | + allocation_plan field + allocation request/response |
| `backend/app/routers/customer.py` | Modify | + POST/PUT allocation plan endpoints |
| `backend/app/main.py` | Modify | Register product router |
| `frontend/src/types/index.ts` | Modify | Add Product, AllocationPlan types |
| `frontend/src/services/api.ts` | Modify | Add product + allocation API functions |
| `frontend/src/components/ProductManager.tsx` | Create | Product list + pagination + modal form + CSV import |
| `frontend/src/components/ProductNavChart.tsx` | Create | Recharts AreaChart for 12-month nav history |
| `frontend/src/components/AllocationPlan.tsx` | Create | 3-plan tabs + AI/user toggle + stacked bar + sliders |
| `frontend/src/components/CustomerProfile.tsx` | Modify | Replace placeholder with ProductManager + AllocationPlan |

---

### Task 1: FinancialProduct Model

**Files:**
- Create: `backend/app/models/product.py`
- Modify: `backend/app/models/customer.py`

- [ ] **Step 1: Create Product model**

```python
import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..database import Base


class ProductType(str, enum.Enum):
    insurance = "保险"
    fund = "基金"
    wealth = "理财"
    trust = "信托"
    structured = "结构化"
    other = "其他"


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[ProductType] = mapped_column(String(20), nullable=False)
    risk_level: Mapped[int] = mapped_column(Integer, nullable=False)
    expected_return: Mapped[float] = mapped_column(Float, nullable=False)
    min_investment: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    issuer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    target_tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    lock_period: Mapped[str | None] = mapped_column(String(100), nullable=True)
    nav_history: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="simulated")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 2: Add allocation_plan to Customer model**

Add after `presales_prep` line in `backend/app/models/customer.py`:
```python
allocation_plan: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

- [ ] **Step 3: Verify model loading**

Run:
```bash
cd e:/PythonProject/backend && python -c "from app.models.product import Product; print('Product model OK')"
```

- [ ] **Step 4: Run migration**

Run:
```bash
cd e:/PythonProject/backend && alembic revision --autogenerate -m "add products table and allocation_plan column" && alembic upgrade head
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/product.py backend/app/models/customer.py backend/alembic/
git commit -m "feat: add FinancialProduct model and allocation_plan column"
```

---

### Task 2: Product Schemas

**Files:**
- Create: `backend/app/schemas/product.py`

- [ ] **Step 1: Write Product Pydantic schemas**

```python
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ProductCreate(BaseModel):
    name: str
    type: str  # 保险/基金/理财/信托/结构化/其他
    risk_level: int  # 1-5
    expected_return: float
    min_investment: float
    description: Optional[str] = None
    issuer: Optional[str] = None
    target_tags: Optional[list[str]] = None
    lock_period: Optional[str] = None


class ProductBatchImport(BaseModel):
    products: list[ProductCreate]


class ProductResponse(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    risk_level: int
    expected_return: float
    min_investment: float
    description: str | None = None
    issuer: str | None = None
    target_tags: list[str] | None = None
    lock_period: str | None = None
    nav_history: list | None = None
    source: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    total: int
    page: int = 1
    page_size: int = 10
    total_pages: int = 1
```

- [ ] **Step 2: Verify imports work**

Run:
```bash
cd e:/PythonProject/backend && python -c "from app.schemas.product import ProductCreate, ProductResponse, ProductListResponse; print('Schemas OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/product.py
git commit -m "feat: add product Pydantic schemas"
```

---

### Task 3: Product CRUD Router

**Files:**
- Create: `backend/app/routers/product.py`
- Modify: `backend/app/services/customer_service.py` (nothing — this task is router only)
- Actually: modify `backend/app/main.py`

- [ ] **Step 1: Write product router with paginated list, create, get, update, delete**

```python
import math
import uuid
from datetime import datetime, timedelta
import random

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.product import Product
from ..schemas.product import ProductCreate, ProductResponse, ProductListResponse

router = APIRouter()


def _generate_nav_history(expected_return: float) -> list[dict]:
    """Generate 12 months of simulated NAV data."""
    nav = 1.0
    history = []
    base_date = datetime.utcnow().replace(day=1) - timedelta(days=365)
    monthly_return = expected_return / 100 / 12
    for i in range(12):
        # Random walk with drift toward expected return
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
    # Don't regenerate nav_history on update
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
```

- [ ] **Step 2: Register product router in main.py**

Add to `backend/app/main.py`:
```python
from .routers import knowledge, customer, chat, product
# ...
app.include_router(product.router, prefix="/api/products", tags=["products"])
```

- [ ] **Step 3: Test endpoints with curl**

```bash
# Create a product
curl -s -X POST http://localhost:8000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"测试产品","type":"基金","risk_level":3,"expected_return":8.5,"min_investment":10000,"description":"测试","issuer":"测试机构"}'

# List products
curl -s http://localhost:8000/api/products | python -c "import sys,json; d=json.load(sys.stdin); print(f'Total: {d[\"total\"]}, Items: {len(d[\"items\"])}')"
```

Expected: `Total: 1, Items: 1`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/product.py backend/app/main.py
git commit -m "feat: add product CRUD API with simulated nav history"
```

---

### Task 4: CSV Batch Import

**Files:**
- Modify: `backend/app/routers/product.py`

- [ ] **Step 1: Add batch import endpoint**

Add to `backend/app/routers/product.py`:
```python
import csv
import io

from fastapi import UploadFile, File


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
```

Note: `import csv, io` goes at top of file; `from fastapi import UploadFile, File` added to existing FastAPI import line.

- [ ] **Step 2: Test CSV import**

Create a test CSV:
```bash
echo 'name,type,risk_level,expected_return,min_investment,description,issuer,target_tags,lock_period
天弘余额宝货币,基金,1,2.3,1,货币基金流动性高,天弘基金,保守,随时申赎
招商产业债券A,基金,2,4.1,1000,纯债基金稳健,招商基金,保守/稳健,T+2
易方达蓝筹精选,基金,4,12.0,1000,股票型基金,易方达基金,进取,T+3' > /tmp/products_test.csv

curl -s -X POST http://localhost:8000/api/products/batch \
  -F "file=@/tmp/products_test.csv" | python -c "import sys,json; d=json.load(sys.stdin); print(f'Imported: {len(d[\"items\"])}')"
```

Expected: `Imported: 3`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/product.py
git commit -m "feat: add CSV batch import endpoint for products"
```

---

### Task 5: Allocation Plan Service (AI Prompt)

**Files:**
- Create: `backend/app/services/allocation_service.py`

- [ ] **Step 1: Write allocation service**

```python
import json
import re
from openai import OpenAI

from ..config import settings

_client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

ALLOCATION_PROMPT = """You are a senior wealth management advisor. Generate a comprehensive asset allocation plan for the client.

【Client Profile】
{client_data}

【Available Products】
{products}

Based on the client's risk tolerance, investment experience, wealth scale, and financial goals, generate THREE allocation plans at different risk levels. Each plan must reference specific client details and product characteristics.

Return ONLY valid JSON, no other text. Use this exact structure:

{{
    "total_investable": <estimated investable amount in CNY, integer>,
    "conservative": {{
        "plan_type": "保守型",
        "overall_rationale": "组合逻辑说明(4-6句)：为什么这样配置，如何匹配客户的风险偏好和财务目标",
        "risk_return_profile": "风险收益概要(2-3句)：预期年化收益区间、最大回撤、夏普比率估算",
        "allocations": [
            {{"product_id": "<UUID from products list>", "ratio": 0.xx, "amount": <integer CNY>, "reason": "配置理由(1-2句)"}}
        ]
    }},
    "balanced": {{
        "plan_type": "稳健型",
        "overall_rationale": "...",
        "risk_return_profile": "...",
        "allocations": [...]
    }},
    "aggressive": {{
        "plan_type": "进取型",
        "overall_rationale": "...",
        "risk_return_profile": "...",
        "allocations": [...]
    }}
}}

Rules:
- All ratio values within a plan MUST sum to exactly 1.0
- Each plan MUST allocate at least 3 different products
- No product's risk_level may exceed the client's risk tolerance score by more than 2
- total_investable estimate based on client assets data; default 1,000,000 if unclear
- Each product_id MUST be an exact UUID from the products list
- All text in Chinese
- Be specific — reference the client's actual age, occupation, income, assets, risk preference
- Do NOT fabricate products — only use products from the provided list"""


def generate_allocation_plan(client_data: dict, products: list[dict]) -> dict:
    """Generate three allocation plans based on client profile and available products."""
    client_json = json.dumps(client_data, ensure_ascii=False, indent=2)
    products_json = json.dumps(products, ensure_ascii=False, indent=2)

    prompt = ALLOCATION_PROMPT.format(client_data=client_json, products=products_json)

    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "You are a senior wealth management advisor. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=6000,
    )

    content = response.choices[0].message.content
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    if json_match:
        content = json_match.group(1)

    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        result = {"error": "JSON parse failed", "raw": content}

    return result
```

- [ ] **Step 2: Verify import**

```bash
cd e:/PythonProject/backend && python -c "from app.services.allocation_service import generate_allocation_plan; print('Service OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/allocation_service.py
git commit -m "feat: add AI allocation plan generation service"
```

---

### Task 6: Allocation Plan API Endpoints

**Files:**
- Modify: `backend/app/schemas/customer.py`
- Modify: `backend/app/routers/customer.py`

- [ ] **Step 1: Add allocation schemas to customer.py**

Add to `backend/app/schemas/customer.py`:
```python
class AllocationPlanSave(BaseModel):
    user_plan: dict
    total_investable: int | None = None
```

Add `allocation_plan` field to `CustomerCreate`:
```python
allocation_plan: dict | None = None
```

Add `allocation_plan` field to `CustomerResponse`:
```python
allocation_plan: dict | None = None
```

- [ ] **Step 2: Add allocation endpoints to customer router**

Add to `backend/app/routers/customer.py`:
```python
from ..services.allocation_service import generate_allocation_plan
from ..models.product import Product
from ..schemas.customer import AllocationPlanSave

@router.post("/{customer_id}/allocation-plan", response_model=CustomerResponse)
def create_allocation_plan(customer_id: uuid.UUID, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Fetch all products
    products = db.query(Product).all()
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

    result = generate_allocation_plan(client_data, products_data)
    import json as _json
    import copy as _copy
    ai_plan = result  # the full result dict from AI
    allocation_plan = {
        "ai_plan": _copy.deepcopy(ai_plan),
        "user_plan": _copy.deepcopy(ai_plan),
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
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
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
```

Note: `import copy` added at top with other imports; `from datetime import datetime` already imported; add `import json as _json` inline (already imported at top as `json`). Use the existing `datetime` import.

Also update `create_customer` and `update_customer` to handle `allocation_plan`:
- `create_customer`: add `allocation_plan=data.allocation_plan,` to Customer constructor
- `update_customer`: add `if data.allocation_plan is not None: customer.allocation_plan = data.allocation_plan`

- [ ] **Step 3: Test generating a plan**

First ensure there are products and a customer with analysis:
```bash
# Check products exist
curl -s http://localhost:8000/api/products | python -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"total\"]} products')"
# Get a customer ID (first one)
CUST_ID=$(curl -s http://localhost:8000/api/customers | python -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0]['id'])")
# Generate plan (may take time for AI)
curl -s -X POST "http://localhost:8000/api/customers/$CUST_ID/allocation-plan" | python -c "import sys,json; d=json.load(sys.stdin); ap=d.get('allocation_plan'); print(f'Plan keys: {list(ap[\"ai_plan\"].keys()) if ap else \"NONE\"}')"
```

Expected: `Plan keys: ['conservative', 'balanced', 'aggressive']` (or similar)

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/customer.py backend/app/routers/customer.py
git commit -m "feat: add allocation plan generation and save endpoints"
```

---

### Task 7: Frontend Types + API Functions

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add types**

Add to `frontend/src/types/index.ts`:
```typescript
export interface Product {
  id: string;
  name: string;
  type: string;
  risk_level: number;
  expected_return: number;
  min_investment: number;
  description: string | null;
  issuer: string | null;
  target_tags: string[] | null;
  lock_period: string | null;
  nav_history: NavPoint[] | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface NavPoint {
  date: string;
  nav: number;
  return_rate: number;
}

export interface ProductList {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AllocationItem {
  product_id: string;
  product_name: string;
  ratio: number;
  amount: number;
  reason: string;
}

export interface AllocationSubPlan {
  plan_type: string;
  overall_rationale: string;
  risk_return_profile: string;
  allocations: AllocationItem[];
}

export interface AllocationPlan {
  ai_plan: Record<string, AllocationSubPlan>;
  user_plan: Record<string, AllocationSubPlan>;
  total_investable?: number;
  generated_at?: string;
}
```

- [ ] **Step 2: Add API functions**

Add to `frontend/src/services/api.ts`:
```typescript
// Products
export const getProducts = (type?: string, riskLevel?: number, q?: string, page = 1, pageSize = 10) => {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (riskLevel !== undefined) params.set('risk_level', String(riskLevel));
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  return request<import('../types').ProductList>(`/products?${params}`);
};
export const getProduct = (id: string) =>
  request<import('../types').Product>(`/products/${id}`);
export const createProduct = (data: Omit<import('../types').Product, 'id' | 'nav_history' | 'source' | 'created_at' | 'updated_at'>) =>
  request<import('../types').Product>('/products', { method: 'POST', body: JSON.stringify(data) });
export const importProductsCsv = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${BASE}/products/batch`, { method: 'POST', body: form }).then(r => {
    if (!r.ok) throw new Error('Import failed');
    return r.json() as Promise<import('../types').ProductList>;
  });
};
export const updateProduct = (id: string, data: Record<string, unknown>) =>
  request<import('../types').Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteProduct = (id: string) =>
  request<void>(`/products/${id}`, { method: 'DELETE' });

// Allocation
export const generateAllocationPlan = (id: string) =>
  request<import('../types').Customer>(`/customers/${id}/allocation-plan`, { method: 'POST' });
export const saveAllocationPlan = (id: string, userPlan: Record<string, unknown>, totalInvestable?: number) =>
  request<import('../types').Customer>(`/customers/${id}/allocation-plan`, {
    method: 'PUT',
    body: JSON.stringify({ user_plan: userPlan, total_investable: totalInvestable }),
  });
```

- [ ] **Step 3: Type check**

```bash
cd e:/PythonProject/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts
git commit -m "feat: add product and allocation types and API functions"
```

---

### Task 8: ProductNavChart Component

**Files:**
- Create: `frontend/src/components/ProductNavChart.tsx`

- [ ] **Step 1: Write navigation chart component**

```tsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { NavPoint } from '../types';

interface Props {
  data: NavPoint[];
}

export default function ProductNavChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <p className="text-xs text-[#484f58] text-center py-4">暂无走势数据</p>;
  }

  const chartData = data.map(p => ({
    date: p.date.slice(0, 7), // "2025-06"
    nav: p.nav,
    return: p.return_rate,
  }));

  return (
    <div className="w-full" style={{ height: 100 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3fb950" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3fb950" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#484f58' }} axisLine={false} tickLine={false} interval={2} />
          <YAxis domain={['dataMin - 0.02', 'dataMax + 0.02']} tick={{ fontSize: 9, fill: '#484f58' }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: '#8b949e' }}
            formatter={(value: number, name: string) => {
              if (name === 'nav') return [`${value.toFixed(4)}`, '净值'];
              return [`${value.toFixed(2)}%`, '收益率'];
            }}
            labelFormatter={(label: string) => label}
          />
          <Area type="monotone" dataKey="nav" stroke="#3fb950" strokeWidth={1.5} fill="url(#navGradient)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
cd e:/PythonProject/frontend && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProductNavChart.tsx
git commit -m "feat: add product nav history area chart component"
```

---

### Task 9: ProductManager Component

**Files:**
- Create: `frontend/src/components/ProductManager.tsx`

- [ ] **Step 1: Write product manager with list, pagination, add modal, CSV import**

```tsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { getProducts, createProduct, importProductsCsv, deleteProduct } from '../services/api';
import type { Product } from '../types';
import ProductNavChart from './ProductNavChart';

const PRODUCT_TYPES = ['保险', '基金', '理财', '信托', '结构化', '其他'];
const RISK_LEVELS = [1, 2, 3, 4, 5];

export default function ProductManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [jumpPage, setJumpPage] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: '基金', risk_level: 3, expected_return: '', min_investment: '', description: '', issuer: '', target_tags: '', lock_period: '' });
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await getProducts(typeFilter || undefined, riskFilter ? Number(riskFilter) : undefined, search || undefined, page);
    setProducts(res.items);
    setTotalPages(res.total_pages);
  }, [page, search, typeFilter, riskFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (q: string) => { setSearch(q); setPage(1); };

  const handlePageChange = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  };

  const handleJumpPage = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && jumpPage.trim()) {
      const n = parseInt(jumpPage, 10);
      if (!isNaN(n)) handlePageChange(n);
      setJumpPage('');
    }
  };

  const handleAdd = async () => {
    await createProduct({
      name: form.name,
      type: form.type,
      risk_level: form.risk_level,
      expected_return: parseFloat(form.expected_return),
      min_investment: parseFloat(form.min_investment),
      description: form.description || null,
      issuer: form.issuer || null,
      target_tags: form.target_tags ? form.target_tags.split(',').map(t => t.trim()).filter(Boolean) : null,
      lock_period: form.lock_period || null,
    } as any);
    setShowAddModal(false);
    setForm({ name: '', type: '基金', risk_level: 3, expected_return: '', min_investment: '', description: '', issuer: '', target_tags: '', lock_period: '' });
    load();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    try {
      await importProductsCsv(file);
      setShowCsvModal(false);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err: any) {
      setImportError(err.message);
    }
  };

  const getRiskLabel = (level: number): { text: string; color: string } => {
    const map: Record<number, { text: string; color: string }> = {
      1: { text: 'R1', color: '#3fb950' },
      2: { text: 'R2', color: '#3fb950' },
      3: { text: 'R3', color: '#d29922' },
      4: { text: 'R4', color: '#f0883e' },
      5: { text: 'R5', color: '#f85149' },
    };
    return map[level] || { text: `R${level}`, color: '#8b949e' };
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center gap-1 pt-2">
        <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1}
          className="px-2 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          &laquo;
        </button>
        {(() => {
          const pages: (number | string)[] = [];
          const delta = 1;
          for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
              pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
              pages.push('...');
            }
          }
          return pages.map((p, idx) =>
            typeof p === 'number' ? (
              <button key={p} onClick={() => handlePageChange(p)}
                className={`w-7 h-7 text-xs rounded transition-colors ${p === page ? 'bg-[#1f6feb] text-white border border-[#388bfd]' : 'border border-transparent text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'}`}>
                {p}
              </button>
            ) : (
              <span key={`dots-${idx}`} className="px-0.5 text-[10px] text-[#484f58] select-none">&hellip;</span>
            )
          );
        })()}
        <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}
          className="px-2 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          &raquo;
        </button>
        <span className="text-[10px] text-[#484f58] ml-2">{page}/{totalPages} 页</span>
        <input type="text" value={jumpPage}
          onChange={e => setJumpPage(e.target.value.replace(/\D/g, ''))}
          onKeyDown={handleJumpPage} placeholder="跳转"
          className="ml-1 w-12 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-[11px] text-[#e6edf3] placeholder-[#484f58] focus:border-[#58a6ff] outline-none" />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="搜索产品名称..." className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] placeholder-[#484f58] focus:border-[#58a6ff] outline-none flex-1" />
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff]">
          <option value="">全部类型</option>
          {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff]">
          <option value="">全部风险</option>
          {RISK_LEVELS.map(r => <option key={r} value={r}>R{r}</option>)}
        </select>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-xs whitespace-nowrap">新增产品</button>
        <button onClick={() => setShowCsvModal(true)} className="btn btn-secondary text-xs whitespace-nowrap">CSV导入</button>
      </div>

      {/* Product list */}
      <div className="space-y-1.5">
        {products.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-[#484f58]">暂无产品数据</p>
            <p className="text-xs text-[#30363d] mt-1">点击"新增产品"或"CSV导入"添加</p>
          </div>
        )}
        {products.map(p => {
          const risk = getRiskLabel(p.risk_level);
          const expanded = expandedId === p.id;
          return (
            <div key={p.id} className="bg-[#0d1117] border border-[#21262d] rounded-md overflow-hidden">
              <div
                onClick={() => setExpandedId(expanded ? null : p.id)}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#161b22] transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: risk.color }} />
                <span className="text-sm text-[#e6edf3] flex-1 truncate">{p.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[#30363d]" style={{ color: risk.color }}>{risk.text}</span>
                <span className="text-[10px] text-[#3fb950] font-mono tabular-nums">+{p.expected_return}%</span>
                <span className="text-[10px] text-[#484f58]">{expanded ? '收起 ▴' : '展开 ▾'}</span>
                <button
                  onClick={e => { e.stopPropagation(); deleteProduct(p.id).then(load); }}
                  className="text-[10px] text-[#f85149] hover:text-[#ff7b72] ml-1"
                >删除</button>
              </div>
              {expanded && (
                <div className="border-t border-[#21262d] px-3 py-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div><span className="text-[#6e7681]">类型</span><br/><span className="text-[#e6edf3]">{p.type}</span></div>
                    <div><span className="text-[#6e7681]">预期收益</span><br/><span className="text-[#3fb950] font-mono">{p.expected_return}%</span></div>
                    <div><span className="text-[#6e7681]">起投金额</span><br/><span className="text-[#e6edf3]">{p.min_investment.toLocaleString()} 元</span></div>
                    <div><span className="text-[#6e7681]">锁定期</span><br/><span className="text-[#e6edf3]">{p.lock_period || '无'}</span></div>
                    {p.issuer && <div><span className="text-[#6e7681]">发行机构</span><br/><span className="text-[#e6edf3]">{p.issuer}</span></div>}
                    {p.description && <div className="col-span-2"><span className="text-[#6e7681]">描述</span><br/><span className="text-[#8b949e]">{p.description}</span></div>}
                  </div>
                  {p.nav_history && p.nav_history.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wider mb-1">近12个月净值走势</p>
                      <ProductNavChart data={p.nav_history} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {renderPagination()}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAddModal(false)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">新增金融产品</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">产品名称 *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">类型</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none">
                    {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">风险等级 (1-5)</label>
                  <select value={form.risk_level} onChange={e => setForm({ ...form, risk_level: Number(e.target.value) })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none">
                    {RISK_LEVELS.map(r => <option key={r} value={r}>R{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">预期年化收益率 (%) *</label>
                  <input type="number" step="0.1" value={form.expected_return} onChange={e => setForm({ ...form, expected_return: e.target.value })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">起投金额 (元) *</label>
                  <input type="number" value={form.min_investment} onChange={e => setForm({ ...form, min_investment: e.target.value })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">发行机构</label>
                <input value={form.issuer} onChange={e => setForm({ ...form, issuer: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">锁定期限</label>
                <input value={form.lock_period} onChange={e => setForm({ ...form, lock_period: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" placeholder="如: T+1、30天、1年" />
              </div>
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">适合人群标签 (逗号分隔)</label>
                <input value={form.target_tags} onChange={e => setForm({ ...form, target_tags: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" placeholder="如: 保守,稳健,长期投资" />
              </div>
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">产品描述</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none resize-none" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowAddModal(false)} className="btn btn-secondary text-xs">取消</button>
                <button onClick={handleAdd} disabled={!form.name || !form.expected_return || !form.min_investment}
                  className="btn btn-primary text-xs disabled:opacity-50">创建</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowCsvModal(false); setImportError(''); }}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-2">CSV 批量导入</h3>
            <p className="text-xs text-[#8b949e] mb-3">列: name,type,risk_level,expected_return,min_investment,description,issuer,target_tags,lock_period</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange}
              className="block w-full text-xs text-[#e6edf3] file:mr-2 file:py-1 file:px-3 file:text-xs file:rounded file:border-0 file:bg-[#1f6feb] file:text-white hover:file:bg-[#388bfd]" />
            {importError && <p className="text-xs text-[#f85149] mt-2">{importError}</p>}
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={() => { setShowCsvModal(false); setImportError(''); }} className="btn btn-secondary text-xs">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
cd e:/PythonProject/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProductManager.tsx
git commit -m "feat: add product manager with list, filters, pagination, add modal, CSV import"
```

---

### Task 10: AllocationPlan Component

**Files:**
- Create: `frontend/src/components/AllocationPlan.tsx`

- [ ] **Step 1: Write allocation plan display with interactive adjustment**

```tsx
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { saveAllocationPlan, generateAllocationPlan } from '../services/api';
import type { Customer, AllocationSubPlan, AllocationItem } from '../types';

interface Props {
  customer: Customer;
  onUpdate: (updated: Customer) => void;
}

const PLAN_KEYS = ['conservative', 'balanced', 'aggressive'] as const;
const PLAN_LABELS: Record<string, string> = { conservative: '保守型', balanced: '稳健型', aggressive: '进取型' };

const PRODUCT_COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#79c0ff'];

export default function AllocationPlan({ customer, onUpdate }: Props) {
  const [planTab, setPlanTab] = useState<string>('conservative');
  const [viewMode, setViewMode] = useState<'ai' | 'user'>('ai');
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRatios, setEditRatios] = useState<Record<string, number>>({});

  const ap = customer.allocation_plan;
  if (!ap) {
    return (
      <div className="text-center py-8">
        <svg className="w-10 h-10 text-[#21262d] mx-auto mb-3" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.744 3.744 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75V1.75Z"/>
        </svg>
        <p className="text-sm text-[#484f58] mb-3">暂无配置方案</p>
        <button onClick={async () => { setGenerating(true); const updated = await generateAllocationPlan((customer as any).id) as any; onUpdate(updated); setGenerating(false); }}
          disabled={generating} className="btn btn-primary text-xs">
          {generating ? 'AI 生成中...' : '生成配置方案'}
        </button>
      </div>
    );
  }

  const planSource = viewMode === 'ai' ? ap.ai_plan : ap.user_plan;
  const plan: AllocationSubPlan | undefined = planSource?.[planTab];
  if (!plan) return <p className="text-sm text-[#484f58] text-center py-4">方案数据缺失</p>;

  const chartData = plan.allocations.map(a => ({
    name: a.product_name.length > 8 ? a.product_name.slice(0, 8) + '...' : a.product_name,
    fullName: a.product_name,
    ratio: Math.round(a.ratio * 100),
    amount: a.amount,
  }));

  const ratioSum = plan.allocations.reduce((s, a) => s + a.ratio, 0);
  const totalInvestable = ap.total_investable || plan.allocations.reduce((s, a) => s + a.amount / (a.ratio || 0.01), 0) / plan.allocations.length || 1000000;

  const startEditing = () => {
    const ratios: Record<string, number> = {};
    plan.allocations.forEach(a => { ratios[a.product_id] = Math.round(a.ratio * 100); });
    setEditRatios(ratios);
    setEditing(true);
  };

  const handleSliderChange = (productId: string, value: number) => {
    setEditRatios(prev => ({ ...prev, [productId]: value }));
  };

  const handleInputChange = (productId: string, value: string) => {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 0 && n <= 100) {
      setEditRatios(prev => ({ ...prev, [productId]: n }));
    }
  };

  const editSum = Object.values(editRatios).reduce((s, v) => s + v, 0);
  const valid = editSum === 100;

  const resetToAi = () => {
    const ratios: Record<string, number> = {};
    const aiPlan = ap.ai_plan?.[planTab];
    if (aiPlan) {
      aiPlan.allocations.forEach(a => { ratios[a.product_id] = Math.round(a.ratio * 100); });
    }
    setEditRatios(ratios);
  };

  const saveEdits = async () => {
    if (!valid) return;
    setSaving(true);
    const updatedUserPlan = JSON.parse(JSON.stringify(ap.user_plan || ap.ai_plan));
    const targetPlan = updatedUserPlan[planTab];
    if (targetPlan) {
      targetPlan.allocations = plan.allocations.map(a => ({
        ...a,
        ratio: (editRatios[a.product_id] || 0) / 100,
        amount: Math.round(((editRatios[a.product_id] || 0) / 100) * totalInvestable),
      }));
    }
    const updated = await saveAllocationPlan(
      (customer as any).id,
      updatedUserPlan,
      totalInvestable,
    ) as any;
    onUpdate(updated);
    setEditing(false);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
        <div className="flex gap-1">
          {PLAN_KEYS.map(k => (
            <button key={k} onClick={() => { setPlanTab(k); setEditing(false); }}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                planTab === k ? 'border-[#58a6ff] text-[#e6edf3] bg-[#1c2128]' : 'border-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}>{PLAN_LABELS[k]}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#21262d] rounded p-0.5">
            <button onClick={() => setViewMode('ai')}
              className={`px-2.5 py-1 text-[10px] rounded transition-colors ${viewMode === 'ai' ? 'bg-[#1f6feb] text-white' : 'text-[#8b949e] hover:text-[#e6edf3]'}`}>AI 方案</button>
            <button onClick={() => setViewMode('user')}
              className={`px-2.5 py-1 text-[10px] rounded transition-colors ${viewMode === 'user' ? 'bg-[#1f6feb] text-white' : 'text-[#8b949e] hover:text-[#e6edf3]'}`}>我的调整</button>
          </div>
          {!editing ? (
            <button onClick={startEditing} className="btn btn-secondary text-xs">编辑配置</button>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={resetToAi} className="btn btn-secondary text-xs">重置为 AI 方案</button>
              <button onClick={saveEdits} disabled={!valid || saving}
                className="btn btn-primary text-xs disabled:opacity-50">{saving ? '保存中...' : '保存调整'}</button>
              <button onClick={() => setEditing(false)} className="btn btn-secondary text-xs">取消</button>
            </div>
          )}
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-md p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCT_COLORS[0] }} />
          <h5 className="text-xs font-semibold text-[#e6edf3]">{plan.plan_type} — 组合概要</h5>
        </div>
        <p className="text-xs text-[#8b949e] leading-relaxed mb-2">{plan.overall_rationale}</p>
        <p className="text-xs text-[#6e7681] leading-relaxed mb-3">{plan.risk_return_profile}</p>

        {/* Stacked bar chart */}
        <div style={{ height: 40 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              barSize={28}>
              <XAxis type="number" domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 11 }}
                formatter={(value: number, _: string, props: any) => [`${value}%`, props.payload.fullName]}
              />
              <Bar dataKey="ratio" stackId="a" radius={0}>
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={PRODUCT_COLORS[idx % PRODUCT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Allocation details */}
      <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider">配置明细</h4>
      <div className="space-y-1.5">
        {plan.allocations.map(a => (
          <div key={a.product_id} className="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2.5">
            {editing ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#e6edf3] w-24 flex-shrink-0 truncate">{a.product_name}</span>
                <input type="range" min={0} max={100} value={editRatios[a.product_id] || 0}
                  onChange={e => handleSliderChange(a.product_id, Number(e.target.value))}
                  className="flex-1 h-1 accent-[#58a6ff]" />
                <span className="text-xs font-mono text-[#e6edf3] w-8 text-right">{editRatios[a.product_id] || 0}%</span>
                <input type="text" value={editRatios[a.product_id] || 0}
                  onChange={e => handleInputChange(a.product_id, e.target.value.replace(/\D/g, ''))}
                  className="w-12 bg-[#161b22] border border-[#30363d] rounded px-1.5 py-0.5 text-[11px] text-[#e6edf3] text-center focus:border-[#58a6ff] outline-none" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-semibold text-[#e6edf3] w-10 flex-shrink-0">{Math.round(a.ratio * 100)}%</span>
                  <div className="min-w-0">
                    <span className="text-xs text-[#e6edf3]">{a.product_name}</span>
                    <p className="text-[10px] text-[#484f58] mt-0.5">{a.reason}</p>
                  </div>
                </div>
                <span className="text-[11px] text-[#8b949e] flex-shrink-0 ml-3">{a.amount.toLocaleString()} 元</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="flex items-center gap-2 text-[10px]">
          <span>总和：</span>
          <span className={`font-mono font-semibold ${valid ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>{editSum}%</span>
          {!valid && <span className="text-[#f85149]">（需为 100%）</span>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
cd e:/PythonProject/frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AllocationPlan.tsx
git commit -m "feat: add allocation plan display with 3-plan tabs, AI/user toggle, and slider adjustment"
```

---

### Task 11: Wire Up CustomerProfile "配置方案" Tab

**Files:**
- Modify: `frontend/src/components/CustomerProfile.tsx`

- [ ] **Step 1: Add local state for customer data to support allocation plan updates**

In `CustomerProfile`, add after the existing `useState` lines:
```tsx
// Local customer state so AllocationPlan can trigger re-renders on update
const [localCustomer, setLocalCustomer] = useState(customer);
// Sync when prop changes
useEffect(() => { setLocalCustomer(customer); }, [customer]);
```

Also add `useEffect` to the import line:
```tsx
import { useRef, useState, useEffect, useCallback } from 'react';
```

Then replace all internal uses of `customer` with `localCustomer` — specifically:
- `const sd = localCustomer.structured_data || {};`
- `const ap = localCustomer.ai_profile as Record<string, string> | null || {};`
- `const dimensions = parseScores(localCustomer.scores);`
- `const pp = localCustomer.presales_prep || {};`
- etc.

- [ ] **Step 2: Replace placeholder in Tab 3 with ProductManager + AllocationPlan**

Replace the Tab 3 content block (the placeholder with "配置方案即将推出") in `CustomerProfile.tsx` with:

```tsx
{/* Tab 3: 配置方案 */}
<div data-tab-panel style={{ display: activeTab === 'allocation' ? 'block' : 'none' }}>
  <div className="space-y-5">
    {apSections.length === 0 ? (
      <div className="text-center py-8">
        <p className="text-sm text-[#484f58] mb-1">请先生成 AI 分析报告</p>
        <p className="text-xs text-[#30363d]">配置方案需要客户画像数据作为输入</p>
      </div>
    ) : (
      <>
        <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-2.5">
          产品库
          <span className="ml-2 font-normal normal-case text-[10px] text-[#484f58]">管理金融产品</span>
        </h4>
        <ProductManager />
        <div className="border-t border-[#21262d]" />
        <AllocationPlan
          customer={localCustomer as any}
          onUpdate={(updated) => setLocalCustomer(updated)}
        />
      </>
    )}
  </div>
</div>
```

Also add the imports at the top of `CustomerProfile.tsx`:
```tsx
import ProductManager from './ProductManager';
import AllocationPlan from './AllocationPlan';
```

- [ ] **Step 3: Update PDF export to use localCustomer**

In `handleExportPDF`, change `customer.name` to `localCustomer.name`:
```tsx
pdf.save(`客户分析_${localCustomer.name}_${new Date().toISOString().slice(0, 10)}.pdf`);
```
And update the dependency array: `}, [localCustomer.name]);`

- [ ] **Step 2: Type check**

```bash
cd e:/PythonProject/frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CustomerProfile.tsx
git commit -m "feat: wire up allocation tab with product manager and plan display"
```

---

### Task 12: Seed Product Data

**Files:**
- Create: `backend/seed_products.py`

- [ ] **Step 1: Write seed script**

```python
"""Generate 25 seed financial products covering all types and risk levels."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models.product import Product, _generate_nav_history

# Manually define _generate_nav_history inline to avoid import issues
import random
from datetime import datetime, timedelta

def gen_nav(expected_return: float) -> list:
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

SEED_PRODUCTS = [
    # 货币/现金管理 (R1)
    {"name": "天弘余额宝货币", "type": "基金", "risk_level": 1, "expected_return": 2.3, "min_investment": 1, "description": "货币基金，流动性极高，适合现金管理", "issuer": "天弘基金", "target_tags": ["保守", "现金管理"], "lock_period": "随时申赎"},
    {"name": "南方天天利货币A", "type": "基金", "risk_level": 1, "expected_return": 2.1, "min_investment": 1, "description": "低门槛货币基金，每日计息", "issuer": "南方基金", "target_tags": ["保守", "现金管理"], "lock_period": "随时申赎"},
    {"name": "建信现金添利货币", "type": "基金", "risk_level": 1, "expected_return": 2.5, "min_investment": 100, "description": "银行系货币基金，规模大流动性好", "issuer": "建信基金", "target_tags": ["保守"], "lock_period": "T+1"},
    # 债券基金 (R2)
    {"name": "招商产业债券A", "type": "基金", "risk_level": 2, "expected_return": 4.1, "min_investment": 1000, "description": "纯债基金，主投高等级信用债，风格稳健", "issuer": "招商基金", "target_tags": ["保守", "稳健"], "lock_period": "T+2"},
    {"name": "易方达稳健收益债券A", "type": "基金", "risk_level": 2, "expected_return": 4.8, "min_investment": 1000, "description": "一级债基，可参与新股申购增强收益", "issuer": "易方达基金", "target_tags": ["保守", "稳健"], "lock_period": "T+2"},
    {"name": "富国信用债债券A", "type": "基金", "risk_level": 2, "expected_return": 3.9, "min_investment": 1000, "description": "专注高等级信用债，低回撤", "issuer": "富国基金", "target_tags": ["保守", "稳健"], "lock_period": "T+2"},
    {"name": "博时安盈债券A", "type": "基金", "risk_level": 2, "expected_return": 3.5, "min_investment": 500, "description": "短债基金，波动小，适合稳健型投资者", "issuer": "博时基金", "target_tags": ["保守"], "lock_period": "T+1"},
    # 混合基金 (R3)
    {"name": "安信稳健增值混合", "type": "基金", "risk_level": 3, "expected_return": 5.2, "min_investment": 1000, "description": "固收+策略，股票仓位不超过30%", "issuer": "安信基金", "target_tags": ["稳健"], "lock_period": "T+3"},
    {"name": "交银定期支付双息平衡", "type": "基金", "risk_level": 3, "expected_return": 6.5, "min_investment": 1000, "description": "股债平衡策略，定期支付现金流", "issuer": "交银施罗德基金", "target_tags": ["稳健", "进取"], "lock_period": "T+3"},
    {"name": "兴全趋势投资混合", "type": "基金", "risk_level": 3, "expected_return": 7.0, "min_investment": 1000, "description": "灵活配置型，根据市场趋势调整仓位", "issuer": "兴证全球基金", "target_tags": ["稳健", "进取"], "lock_period": "T+3"},
    {"name": "中欧价值发现混合", "type": "基金", "risk_level": 3, "expected_return": 7.8, "min_investment": 1000, "description": "价值投资风格，精选低估值标的", "issuer": "中欧基金", "target_tags": ["稳健", "进取"], "lock_period": "T+3"},
    # 股票基金 (R4)
    {"name": "招商中证白酒指数", "type": "基金", "risk_level": 4, "expected_return": 12.0, "min_investment": 1000, "description": "跟踪中证白酒指数，行业集中度高", "issuer": "招商基金", "target_tags": ["进取"], "lock_period": "T+3"},
    {"name": "易方达蓝筹精选混合", "type": "基金", "risk_level": 4, "expected_return": 10.5, "min_investment": 1000, "description": "精选大盘蓝筹股，长期持有优质企业", "issuer": "易方达基金", "target_tags": ["进取"], "lock_period": "T+3"},
    {"name": "富国天惠成长混合", "type": "基金", "risk_level": 4, "expected_return": 11.0, "min_investment": 1000, "description": "成长股投资，聚焦高景气赛道", "issuer": "富国基金", "target_tags": ["进取"], "lock_period": "T+3"},
    {"name": "景顺长城鼎益混合", "type": "基金", "risk_level": 4, "expected_return": 9.8, "min_investment": 1000, "description": "消费主题基金，布局大消费赛道", "issuer": "景顺长城基金", "target_tags": ["进取"], "lock_period": "T+3"},
    {"name": "汇添富消费行业混合", "type": "基金", "risk_level": 4, "expected_return": 10.2, "min_investment": 1000, "description": "聚焦消费升级主题", "issuer": "汇添富基金", "target_tags": ["进取"], "lock_period": "T+3"},
    # 保险产品 (R2)
    {"name": "泰康人寿稳利年年", "type": "保险", "risk_level": 2, "expected_return": 3.8, "min_investment": 10000, "description": "分红型年金保险，保底收益+浮动分红", "issuer": "泰康人寿", "target_tags": ["保守", "稳健"], "lock_period": "5年"},
    {"name": "平安福满分两全保险", "type": "保险", "risk_level": 2, "expected_return": 3.2, "min_investment": 5000, "description": "两全保险，到期返还+身故保障", "issuer": "中国平安", "target_tags": ["保守", "稳健"], "lock_period": "10年"},
    {"name": "太平洋金佑人生终身寿险", "type": "保险", "risk_level": 2, "expected_return": 3.5, "min_investment": 8000, "description": "终身寿险，现金价值增长稳定", "issuer": "太平洋保险", "target_tags": ["保守", "稳健", "长期投资"], "lock_period": "终身"},
    # 信托产品 (R3)
    {"name": "华润信托稳益系列", "type": "信托", "risk_level": 3, "expected_return": 6.0, "min_investment": 1000000, "description": "集合资金信托，投资优质非标资产", "issuer": "华润信托", "target_tags": ["稳健", "高净值"], "lock_period": "1年"},
    {"name": "外贸信托消费金融1号", "type": "信托", "risk_level": 3, "expected_return": 6.8, "min_investment": 500000, "description": "消费金融资产支持信托", "issuer": "外贸信托", "target_tags": ["稳健", "高净值"], "lock_period": "6个月"},
    # 结构化产品 (R4)
    {"name": "中信证券雪球结构1号", "type": "结构化", "risk_level": 4, "expected_return": 8.0, "min_investment": 1000000, "description": "挂钩中证500指数的雪球结构收益凭证", "issuer": "中信证券", "target_tags": ["进取", "高净值"], "lock_period": "2年"},
    {"name": "华泰证券凤凰结构1号", "type": "结构化", "risk_level": 4, "expected_return": 7.5, "min_investment": 500000, "description": "挂钩沪深300的凤凰结构产品，提前敲出机制", "issuer": "华泰证券", "target_tags": ["进取", "高净值"], "lock_period": "1.5年"},
    # 高收益产品 (R5)
    {"name": "淡水泉成长一期私募", "type": "基金", "risk_level": 5, "expected_return": 18.0, "min_investment": 1000000, "description": "阳光私募，深度价值挖掘，高波动高收益", "issuer": "淡水泉投资", "target_tags": ["进取", "高净值", "高风险"], "lock_period": "1年"},
    {"name": "九坤量化对冲1号", "type": "基金", "risk_level": 5, "expected_return": 15.0, "min_investment": 1000000, "description": "量化对冲策略，市场中性，低相关性收益来源", "issuer": "九坤投资", "target_tags": ["进取", "高净值"], "lock_period": "6个月"},
]

def seed():
    db = SessionLocal()
    existing = db.query(Product).count()
    if existing >= 25:
        print(f"Already {existing} products, skipping seed")
        db.close()
        return
    for p_data in SEED_PRODUCTS:
        product = Product(
            name=p_data["name"],
            type=p_data["type"],
            risk_level=p_data["risk_level"],
            expected_return=p_data["expected_return"],
            min_investment=p_data["min_investment"],
            description=p_data.get("description"),
            issuer=p_data.get("issuer"),
            target_tags=p_data.get("target_tags"),
            lock_period=p_data.get("lock_period"),
            nav_history=gen_nav(p_data["expected_return"]),
        )
        db.add(product)
    db.commit()
    db.close()
    print(f"Seeded {len(SEED_PRODUCTS)} products")

if __name__ == "__main__":
    seed()
```

- [ ] **Step 2: Run seed script**

```bash
cd e:/PythonProject && source .venv/Scripts/activate && cd backend && python seed_products.py
```

Expected: `Seeded 25 products`

- [ ] **Step 3: Verify products in API**

```bash
curl -s "http://localhost:8000/api/products?page_size=30" | python -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"total\"]} products, {d[\"total_pages\"]} pages')"
```

Expected: `25 products, 3 pages`

- [ ] **Step 4: Commit**

```bash
git add backend/seed_products.py
git commit -m "feat: add seed script with 25 financial products across all risk levels"
```

---

### Task 13: End-to-End Verification

- [ ] **Step 1: Restart services**

```bash
# Kill existing processes on ports 8000 and 5173
for port in 8000 5173; do pid=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}'); [ -n "$pid" ] && taskkill //F //PID $pid 2>/dev/null; done
# Start backend
cd e:/PythonProject/backend && uvicorn app.main:app --reload --port 8000 &
# Start frontend  
cd e:/PythonProject/frontend && npm run dev &
```

- [ ] **Step 2: Full flow verification checklist**

In browser at http://localhost:5173:

1. Navigate to 客户分析 → select a customer with AI profile (e.g., 张伟)
2. Click "配置方案" tab → should see product library
3. Products show with pagination (3 pages at 10/page)
4. Click "展开" on a product → see detail info + nav chart
5. Test filters: filter by type "基金", by risk level
6. Click "新增产品" → fill form → create → verify it appears
7. Click "CSV导入" → upload a test CSV → verify import
8. Click "生成配置方案" → wait for AI → verify 3 plan tabs appear
9. Switch plans: 保守 → 稳健 → 进取
10. Toggle AI/我的调整 → verify same data initially
11. Click "编辑配置" → drag sliders → verify sum validation
12. Set valid 100% → click "保存调整" → verify toggle switches
13. Toggle between AI 方案 and 我的调整 → verify differences
14. Export PDF → verify all tabs content included

- [ ] **Step 3: Commit any fixes if needed, then done.**
