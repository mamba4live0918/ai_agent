# 基本信息九宫格编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the customer basic info section into an editable 3×3 9-grid, with edits persisted and reused when regenerating AI profile.

**Architecture:** Frontend adds inline editing to each basic info cell, saving via existing `PUT /api/customers/{id}`. The regenerate endpoint is extended to accept optional `structured_data` which is injected into the LLM prompt as priority reference. Backend `analyze_customer()` gets a new optional parameter for manual data injection.

**Tech Stack:** React 19 + TypeScript (frontend), FastAPI + DeepSeek (backend)

---

### Task 1: Backend — Accept structured_data in regenerate endpoint

**Files:**
- Modify: `backend/app/schemas/customer.py` (add schema)
- Modify: `backend/app/routers/customer.py:68-82`
- Modify: `backend/app/services/customer_service.py:101-133`

- [ ] **Step 1: Add RegenerateProfileRequest schema**

In `backend/app/schemas/customer.py`, add after `CustomerAnalyzeResponse`:

```python
class RegenerateProfileRequest(BaseModel):
    structured_data: dict | None = None
```

- [ ] **Step 2: Modify regenerate endpoint to accept structured_data**

In `backend/app/routers/customer.py`, change the regenerate endpoint:

```python
from ..schemas.customer import (
    CustomerCreate, CustomerAnalyzeRequest, CustomerAnalyzeResponse,
    CustomerResponse, CustomerListResponse, AllocationPlanSave,
    RegenerateProfileRequest,
)

@router.post("/{customer_id}/regenerate-profile", response_model=CustomerResponse)
def regenerate_customer_profile(
    customer_id: uuid.UUID,
    data: RegenerateProfileRequest | None = None,
    db: Session = Depends(get_db),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not customer.raw_input:
        raise HTTPException(status_code=400, detail="Customer has no raw_input to re-analyze")

    edited_sd = data.structured_data if data else None
    # Merge: user edits override DB structured_data, then pass to analyze
    merged_sd = {**(customer.structured_data or {}), **(edited_sd or {})}
    result = analyze_customer(customer.raw_input, edited_structured_data=merged_sd)
    customer.name = result.get("name", customer.name)
    customer.structured_data = result.get("structured_data", customer.structured_data)
    customer.ai_profile = result.get("ai_profile", customer.ai_profile)
    customer.scores = result.get("scores", customer.scores)
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)
```

- [ ] **Step 3: Modify analyze_customer() to accept and inject edited data**

In `backend/app/services/customer_service.py`, add `{manual_context}` placeholder to ANALYSIS_PROMPT after `{kb_context}`:

```python
ANALYSIS_PROMPT = """...existing prompt...
{kb_context}

{manual_context}

Return ONLY valid JSON...
```

Then modify `analyze_customer()`:

```python
def analyze_customer(raw_text: str, edited_structured_data: dict | None = None) -> dict:
    kb_context = search_knowledge_base(raw_text)

    # Build manual context from edited structured_data
    manual_context = ""
    if edited_structured_data:
        parts = []
        for key, label in [
            ("age", "年龄"), ("gender", "性别"), ("occupation", "职业"),
            ("income_level", "收入水平"), ("assets", "资产状况"),
            ("risk_preference", "风险偏好"), ("investment_experience", "投资经验"),
            ("family_status", "家庭状况"), ("goals", "理财目标"),
        ]:
            val = edited_structured_data.get(key)
            if val and val != "未知" and val != "":
                parts.append(f"- {label}：{val}")
        if parts:
            manual_context = "\n".join([
                "",
                "【人工补充信息（最高优先级）】",
                "以下信息来自销售人员手动填写，请严格采用这些数据，不要用 AI 重新推断或覆盖：",
                *parts,
                "对于未列出的字段，继续从原始客户描述中提取。",
            ])

    prompt = ANALYSIS_PROMPT.format(
        raw_text=raw_text,
        kb_context=kb_context,
        manual_context=manual_context,
    )
    # ... rest unchanged
```

The rest of the function (LLM call + JSON parsing) stays identical.

- [ ] **Step 4: Verify backend starts without errors**

```bash
cd backend && uvicorn app.main:app --port 8000 &
sleep 3
curl -s http://localhost:8000/api/health
# Expected: {"status":"ok"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/customer.py backend/app/routers/customer.py backend/app/services/customer_service.py
git commit -m "feat: regenerate-profile accepts structured_data for human-AI collaboration"
```

---

### Task 2: Frontend — API layer update

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Update regenerateProfile to accept structured_data**

In `frontend/src/services/api.ts`, change:

```typescript
export const regenerateProfile = (id: string, structuredData?: Record<string, unknown>) =>
  request<import('../types').Customer>(`/customers/${id}/regenerate-profile`, {
    method: 'POST',
    body: JSON.stringify({ structured_data: structuredData || null }),
  });
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
# Expected: no output (no errors)
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: regenerateProfile API accepts optional structured_data"
```

---

### Task 3: Frontend — CustomerProfile 9-grid editor

**Files:**
- Modify: `frontend/src/components/CustomerProfile.tsx`

- [ ] **Step 1: Add edit state for the 9 cells**

Add after existing state declarations (after line 61 `const [regenerating, setRegenerating] = useState(false);`):

```typescript
const [editingField, setEditingField] = useState<string | null>(null);
const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Remove filter from fields, show all 9 always**

Change the `fields` variable (line 69-79) from:

```typescript
const fields = ([
    ['年龄', String(sd.age ?? '')],
    ['性别', String(sd.gender ?? '')],
    ['职业', String(sd.occupation ?? '')],
    ['收入水平', String(sd.income_level ?? '')],
    ['资产状况', String(sd.assets ?? '')],
    ['风险偏好', String(sd.risk_preference ?? '')],
    ['投资经验', String(sd.investment_experience ?? '')],
    ['家庭状况', String(sd.family_status ?? '')],
    ['理财目标', String(sd.goals ?? '')],
  ] as [string, string][]).filter(([, v]) => v && v !== '未知');
```

To:

```typescript
const FIELD_KEYS: Record<string, string> = {
  '年龄': 'age', '性别': 'gender', '职业': 'occupation',
  '收入水平': 'income_level', '资产状况': 'assets', '风险偏好': 'risk_preference',
  '投资经验': 'investment_experience', '家庭状况': 'family_status', '理财目标': 'goals',
};

const fields = (Object.entries(FIELD_KEYS) as [string, string][]).map(([label, key]) => {
  const stored = String((sd as Record<string, unknown>)[key] ?? '');
  const raw = stored && stored !== '未知' ? stored : '';
  return [label, raw, key] as [string, string, string];
});
```

- [ ] **Step 3: Update imports and add save-edit handler**

Change line 5 from:

```typescript
import { regenerateProfile } from '../services/api';
```

To:

```typescript
import { regenerateProfile, updateCustomer } from '../services/api';
```

Add after `handleRegenerate`:

```typescript
const handleFieldEdit = (key: string, value: string) => {
  setFieldEdits(prev => ({ ...prev, [key]: value }));
};

const saveFieldEdits = async () => {
  if (!('id' in localCustomer)) return;
  const updatedSD = { ...(localCustomer.structured_data || {}) };
  for (const [key, val] of Object.entries(fieldEdits)) {
    updatedSD[key] = val || null;
  }
  try {
    const updated = await updateCustomer((localCustomer as Customer).id, {
      name: localCustomer.name,
      structured_data: updatedSD,
    });
    setLocalCustomer(updated);
    setEditingField(null);
    setFieldEdits({});
  } catch { /* silently skip */ }
};
```

- [ ] **Step 4: Fix `hasAnyData` to work with always-visible 9-grid**

Change line 104 from:

```typescript
const hasAnyData = fields.length > 0 || apSections.length > 0 || dimensions.length > 0;
```

To:

```typescript
const hasAnyData = fields.some(([, val]) => !!val) || apSections.length > 0 || dimensions.length > 0;
```

(This prevents the "暂无分析数据" message from never showing since fields always has 9 entries.)

- [ ] **Step 6: Replace the basic info grid JSX with editable 9-grid**

Replace the entire `{fields.length > 0 && (...)}` block (lines 274-287) with:

```tsx
{/* Basic info always shows 9-grid */}
<div data-pdf-section="基本信息">
  <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-2.5">基本信息</h4>
  <div className="grid grid-cols-3 gap-2">
    {fields.map(([label, value, key]) => {
      const displayValue = fieldEdits[key] !== undefined ? fieldEdits[key] : value;
      const isEmpty = !displayValue;
      const isEditing = editingField === key;

      return (
        <div
          key={key}
          className={`relative rounded-md border p-2.5 min-h-[72px] flex flex-col ${
            isEmpty ? 'border-[#30363d]/50 bg-[#161b22]/50' : 'border-[#21262d] bg-[#0d1117]'
          }`}
        >
          <div className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wider mb-1">{label}</div>
          {isEditing ? (
            <textarea
              className="flex-1 w-full bg-[#161b22] border border-[#30363d] rounded p-1.5 text-xs text-[#e6edf3] resize-none focus:outline-none focus:border-[#58a6ff]"
              value={fieldEdits[key] || ''}
              onChange={e => handleFieldEdit(key, e.target.value)}
              rows={2}
            />
          ) : !isEmpty ? (
            <p className="text-sm text-[#e6edf3] font-medium flex-1">{displayValue}</p>
          ) : (
            <p className="text-sm text-[#30363d] flex-1">—</p>
          )}

          <div className="flex items-center justify-end mt-1">
            {isEditing ? (
              <button
                onClick={() => saveFieldEdits()}
                className="text-[10px] px-2 py-0.5 rounded bg-[#238636] text-white hover:bg-[#2ea043] transition-colors"
              >
                保存
              </button>
            ) : (
              <button
                onClick={() => {
                  setFieldEdits(prev => ({ ...prev, [key]: displayValue }));
                  setEditingField(key);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors pdf-hide"
              >
                ✎
              </button>
            )}
          </div>
        </div>
      );
    })}
  </div>
</div>
```

- [ ] **Step 7: Update handleRegenerate to pass structured_data**

Change the `handleRegenerate` function:

```typescript
const handleRegenerate = async () => {
    if (!('id' in localCustomer)) return;
    setRegenerating(true);
    try {
      const updated = await regenerateProfile(
        (localCustomer as Customer).id,
        (localCustomer.structured_data as Record<string, unknown>) || undefined,
      );
      setLocalCustomer(updated);
    } catch { /* silently skip */ }
    finally { setRegenerating(false); }
  };
```

- [ ] **Step 8: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/CustomerProfile.tsx
git commit -m "feat: editable 9-grid basic info with regenerate data passthrough"
```

---

### Verification

- [ ] **Verify: basic info shows all 9 cells** — open any customer, even one with minimal data
- [ ] **Verify: edit cell** — click ✎, enter text, save, refresh — edit persists
- [ ] **Verify: regenerate with manual data** — edit a cell, click regenerate, check AI analysis incorporates the manual edit
- [ ] **Verify: PDF export** — export PDF, 9-grid renders with manual edits visible, edit buttons hidden
- [ ] **Verify: no regression** — customer without raw_input shows existing data, regenerate disabled/hidden
