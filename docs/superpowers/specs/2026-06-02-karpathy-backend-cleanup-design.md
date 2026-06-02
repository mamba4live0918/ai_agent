# Karpathy Four-Principle Backend Code Cleanup

## Background

The ai_trainer backend (~25 Python files across routers/services/models/utils) was built incrementally alongside the frontend. As features were added rapidly, several patterns of technical debt accumulated:

- LLM API calls that assume success and blindly access `.choices[0].message.content`
- Database queries that assume `.first()` always returns a row
- User input that passes through to SQL without validation
- Environment variables read with `os.getenv()` that silently return `None`

This cleanup applies Andrej Karpathy's 4 coding principles to systematically audit and fix the backend.

## Scope

**In scope**: `backend/app/*.py` (~25 files)
**Out of scope**: `frontend/`, Alembic migrations, `main.py` (Gradio prototype), config files, `.env`

## Architecture: Round-by-Round Scanning

Four sequential rounds, each scanning all files with a single principle focus. Each round ends with `test_e2e.py` passing.

```
Round 1: Assumption Management → Round 2: Overcomplexity → Round 3: Orthogonal Edits → Round 4: Weak Verification
```

---

## Round 1: Assumption Management

### 1.1 External API calls — no response validation

**Scan target**: Every call to DeepSeek, Jina, ChromaDB, EastMoney API.

**Fix**: Guard the response before accessing nested fields.

```python
# Before (assumes success)
reply = response.choices[0].message.content

# After (guards against empty/failed response)
if not response.choices or not response.choices[0].message.content:
    raise ServiceError("LLM returned empty response")
reply = response.choices[0].message.content
```

Common guard patterns:
- DeepSeek: check `response.choices` non-empty, `finish_reason` not `"error"`
- Jina Embedding: check `data` list non-empty, each vector non-null
- ChromaDB: check `results['documents']` and `results['ids']` are non-empty lists
- EastMoney NAV: catch `httpx.HTTPStatusError`, handle HTML error page responses

### 1.2 Database queries — assuming data exists

**Scan target**: Every `.first()`, `.all()`, `[0]` on query results.

**Fix**: Check for None/empty before accessing.

```python
# Before
session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
# ... later uses session.user_id directly

# After
session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
if not session:
    raise HTTPException(status_code=404, detail="Session not found")
```

### 1.3 User input — unvalidated

**Scan target**: Router parameters without Pydantic constraints, raw strings used as IDs.

**Fix**:
- Pagination: add `Field(ge=1, le=100)` to limit params
- UUID paths: use `uuid.UUID` type so FastAPI auto-validates
- File uploads: use `filetype` library to check real MIME, not just extension
- String lengths: add `min_length=1, max_length=X` to free-text fields

### 1.4 Config/environment — silent failures

**Scan target**: `os.getenv()` calls that may return `None`.

**Fix**: Add a `_require(key)` helper in `config.py` that raises clear error at startup.

```python
def _require(key: str) -> str:
    val = os.getenv(key)
    if not val:
        raise RuntimeError(f"Required env var {key} is not set. Add it to your .env file.")
    return val
```

### What Round 1 does NOT do
- No retry/fallback logic (functional enhancement)
- No changes to existing valid Pydantic schemas
- No network timeout handling (resilience engineering)

---

## Round 2: Overcomplexity

### Fix targets

| Pattern | Action |
|---------|--------|
| Single-implementation base class / protocol | Flatten to concrete class |
| ≤3 line function that only calls another function | Inline at call sites |
| Repeated prompt template strings across services | Extract to one `prompt_templates.py` |
| Variable assigned then used exactly once on next line | Inline the expression |
| Bare `dict` with ≥5 fixed keys used as struct | Replace with Pydantic model or dataclass |

### Complexity thresholds (skip if below)

- Function < 5 lines → leave alone
- Class with < 2 methods → leave alone
- Single deep-nested block that's locally logical → leave alone

---

## Round 3: Orthogonal Edits

### Only two cleanup actions

1. **Dead code**: Use `codegraph_callers` to verify zero callers → delete function/class/import
2. **Unused imports**: Remove imports not referenced in the file

### Explicitly NOT done
- No bug fixes
- No feature additions
- No variable renames (even if confusing)
- No formatting changes
- Code that "looks wrong but works" → noted for future, not touched

---

## Round 4: Weak Verification

### Enhance `test_e2e.py` assertions

Current state: mostly calls endpoints without checking response bodies.

Target: add meaningful assertions to each test case.

| Assertion type | Example |
|---------------|---------|
| Status code | `assert resp.status == 200` |
| Key field presence | `assert "id" in data` |
| Auth boundary | `assert resp.status == 403` for non-admin hitting admin endpoints |
| 404 boundary | `assert resp.status == 404` for non-existent UUID |
| Response shape | `assert isinstance(data["items"], list)` |

Target: ~60 total assertions (up from ~15 currently).

---

## Verification Gates

After each round:
1. `cd backend && uvicorn app.main:app --port 8000` starts without import errors
2. `python test_e2e.py` passes all tests
3. One git commit per round

## Constraints

- Backend only (`backend/app/`)
- No new dependencies beyond `filetype` (already used for MIME detection)
- Each round must complete within one session
- Commits must be independent (each round is a working state)
