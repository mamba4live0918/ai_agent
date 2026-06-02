# Karpathy Backend Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and fix ~55 backend Python files against Karpathy's 4 principles, round-by-round, with each round producing a passing E2E test run and one commit.

**Architecture:** Four sequential rounds scanning all `backend/app/*.py` files. Round 1 = guards on every external call/DB query/input/env-var. Round 2 = flatten over-abstractions and deduplicate. Round 3 = delete dead code and unused imports only. Round 4 = strengthen E2E test assertions.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, ChromaDB, DeepSeek API, faster-whisper, edge-tts, pytest (for E2E)

---

## File Map

### Routers (12 files)
| File | Lines (approx) | Key concern |
|------|---------------|-------------|
| `routers/auth.py` | ~80 | DB query guards, input validation |
| `routers/chat.py` | ~80 | RAG call guards |
| `routers/customer.py` | ~250 | Large file — DB queries, UUID validation |
| `routers/feedback.py` | ~80 | DB queries |
| `routers/groups.py` | ~180 | DB queries, permission checks |
| `routers/instructor.py` | ~100 | DB queries, CSV export |
| `routers/knowledge.py` | ~350 | Large file — file uploads, DB queries, ChromaDB |
| `routers/post_sales.py` | ~180 | File uploads, audio processing |
| `routers/product.py` | ~150 | DB queries, fund code validation |
| `routers/quiz.py` | ~80 | DB queries |
| `routers/realtime.py` | ~100 | DB queries, WebSocket |
| `routers/training.py` | ~200 | DB queries, session management |

### Services (15 files)
| File | Lines (approx) | Key concern |
|------|---------------|-------------|
| `services/rag_service.py` | ~250 | DeepSeek calls, ChromaDB queries |
| `services/customer_service.py` | ~200 | DeepSeek calls, KB retrieval |
| `services/allocation_service.py` | ~150 | DeepSeek calls |
| `services/training_service.py` | ~350 | Large file — DeepSeek calls (x2 agents), prompt templates |
| `services/post_sales_service.py` | ~300 | DeepSeek, faster-whisper, ffmpeg |
| `services/quiz_service.py` | ~120 | DeepSeek calls |
| `services/embedding_service.py` | ~200 | Jina API, ChromaDB |
| `services/fund_service.py` | ~80 | EastMoney API (httpx) |
| `services/trigger_engine.py` | ~200 | YAML rules, DeepSeek streaming |
| `services/realtime_asr.py` | ~180 | Silero-VAD, faster-whisper |
| `services/speaker_clustering.py` | ~120 | pyannote embedding |
| `services/tts_service.py` | ~60 | edge-tts |
| `services/realtime_service.py` | ~80 | DB queries |
| `services/web_search_service.py` | ~80 | External HTTP |
| `services/audit_service.py` | ~60 | DB queries |

### Models, Schemas, Utils, Middleware, Config (28 files)
Mostly definitions — quick scan, fewer issues expected.

---

## Round 1: Assumption Management (Tasks 1-9)

### Task 1: Config + common guard utilities

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add `_require()` helper and `ServiceError` exception**

In `backend/app/config.py`, add after existing `warnings.warn` block for SECRET_KEY:

```python
class ServiceError(Exception):
    """Raised when an external service (LLM, Embedding, etc.) returns an unexpected response."""
    pass


def _require(key: str) -> str:
    """Return env var value. Raise immediately if unset — fail fast, not silently."""
    val = os.getenv(key)
    if not val:
        raise RuntimeError(
            f"Required environment variable '{key}' is not set. "
            f"Add it to your .env file in the backend directory."
        )
    return val
```

- [ ] **Step 2: Replace silent `os.getenv()` calls with `_require()`**

Replace all `os.getenv("KEY")` with `_require("KEY")` for these keys:
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `JINA_API_KEY`
- `JINA_BASE_URL`
- `HUGGINGFACE_TOKEN` — keep as `os.getenv()` (optional, only needed for speaker diarization)

Do NOT replace `SECRET_KEY` (has fallback warning) or optional keys.

- [ ] **Step 3: Verify config imports work**

Run: `cd backend && python -c "from app.config import ServiceError, _require; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py
git commit -m "fix(config): add ServiceError and _require() guard for env vars"
```

---

### Task 2: Guard DeepSeek API calls in service files

**Files:**
- Modify: `backend/app/services/rag_service.py`
- Modify: `backend/app/services/customer_service.py`
- Modify: `backend/app/services/allocation_service.py`
- Modify: `backend/app/services/training_service.py`
- Modify: `backend/app/services/post_sales_service.py`
- Modify: `backend/app/services/quiz_service.py`
- Modify: `backend/app/services/trigger_engine.py`

- [ ] **Step 1: Add response guard pattern to each DeepSeek call site**

Pattern applied at every `client.chat.completions.create(...)` call site:

```python
from app.config import ServiceError

# ... existing code that builds messages/params ...

try:
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=stream,  # if applicable
    )
except Exception as e:
    raise ServiceError(f"DeepSeek API call failed: {e}")

# Guard response before accessing .content
if not response.choices or not response.choices[0].message:
    raise ServiceError("DeepSeek returned an empty response")

content = response.choices[0].message.content
if content is None or content.strip() == "":
    raise ServiceError("DeepSeek returned empty content")

# For streaming: check each chunk
# if not chunk.choices or not chunk.choices[0].delta:
#     continue
```

Files and their call sites:
- `rag_service.py`: `build_chat_prompt()` and `generate_flexible_answer()` — 2 call sites
- `customer_service.py`: `analyze_customer()` and `generate_sales_prep()` — 2 call sites
- `allocation_service.py`: `generate_allocation_plans()` — 1 call site
- `training_service.py`: `generate_customer_response()` and `generate_coach_tip()` — 2 call sites
- `post_sales_service.py`: `generate_post_sales_report()` — 1 call site
- `quiz_service.py`: `generate_quiz_questions()` — 1 call site
- `trigger_engine.py`: `_generate_coach_tip_stream()` — 1 call site (streaming, use chunk-level guard)

- [ ] **Step 2: Remove bare `response.choices[0].message.content` access patterns**

Replace every unguarded `.choices[0].message.content` with the guarded version above.

- [ ] **Step 3: Verify with E2E test**

Run: `cd backend && python test_e2e.py`
Expected: all tests pass (tests that hit LLM endpoints may fail if API key is missing — those are pre-existing)

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/rag_service.py backend/app/services/customer_service.py backend/app/services/allocation_service.py backend/app/services/training_service.py backend/app/services/post_sales_service.py backend/app/services/quiz_service.py backend/app/services/trigger_engine.py
git commit -m "fix(services): guard all DeepSeek API calls with ServiceError on empty/missing response"
```

---

### Task 3: Guard ChromaDB and Jina Embedding calls

**Files:**
- Modify: `backend/app/services/embedding_service.py`

- [ ] **Step 1: Guard Jina Embedding API call**

```python
try:
    response = self.jina_client.embeddings.create(
        model="jina-embeddings-v3",
        input=texts,
    )
except Exception as e:
    raise ServiceError(f"Jina Embedding API call failed: {e}")

if not response.data or len(response.data) == 0:
    raise ServiceError("Jina Embedding returned empty data")

embeddings = []
for item in response.data:
    if item.embedding is None or len(item.embedding) == 0:
        raise ServiceError(f"Jina Embedding returned null/empty embedding for item {item.index}")
    embeddings.append(item.embedding)
```

- [ ] **Step 2: Guard ChromaDB query results**

At each `collection.query(...)` call site:

```python
results = collection.query(query_embeddings=[query_embedding], n_results=n_results)

if not results or not results.get('documents') or not results['documents'][0]:
    # No match — return empty, not an error for KB-first pattern
    return []

# Guard against misaligned results
if not results.get('ids') or not results.get('metadatas'):
    return []
```

- [ ] **Step 3: Guard ChromaDB add/upsert/delete operations**

At each `collection.add()` / `collection.upsert()` / `collection.delete()` site:

```python
try:
    collection.add(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)
except Exception as e:
    raise ServiceError(f"ChromaDB write operation failed: {e}")
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/embedding_service.py
git commit -m "fix(embedding): guard Jina and ChromaDB calls against empty/malformed responses"
```

---

### Task 4: Guard external HTTP and other service calls

**Files:**
- Modify: `backend/app/services/fund_service.py` (EastMoney API)
- Modify: `backend/app/services/web_search_service.py` (external search)
- Modify: `backend/app/services/realtime_asr.py` (faster-whisper)
- Modify: `backend/app/services/speaker_clustering.py` (pyannote)
- Modify: `backend/app/services/tts_service.py` (edge-tts)
- Modify: `backend/app/services/post_sales_service.py` (ffmpeg + faster-whisper transcription)

- [ ] **Step 1: Guard EastMoney API in `fund_service.py`**

```python
import httpx
from app.config import ServiceError

try:
    response = httpx.get(url, timeout=10.0)
    response.raise_for_status()
except httpx.HTTPStatusError as e:
    raise ServiceError(f"EastMoney API returned HTTP {e.response.status_code}")
except httpx.RequestError as e:
    raise ServiceError(f"EastMoney API request failed: {e}")

data = response.json()
if not data or data.get("ErrCode") != 0:
    raise ServiceError(f"EastMoney API returned error: {data}")
```

- [ ] **Step 2: Guard web search in `web_search_service.py`**

```python
try:
    response = httpx.get(search_url, params=params, timeout=10.0)
    response.raise_for_status()
except httpx.HTTPError as e:
    raise ServiceError(f"Web search API failed: {e}")
```

- [ ] **Step 3: Guard faster-whisper in `realtime_asr.py` and `post_sales_service.py`**

At each `model.transcribe()` call:

```python
segments, info = model.transcribe(audio, beam_size=3, best_of=3, repetition_penalty=1.2)
if info is None:
    raise ServiceError("ASR transcription failed: no info returned")

# If language is unexpected, log but don't fail
if info.language != "zh" and info.language_probability > 0.9:
    # log warning, continue
    pass
```

- [ ] **Step 4: Guard edge-tts in `tts_service.py`**

```python
try:
    communicate = edge_tts.Communicate(text, voice)
    audio_chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])
except Exception as e:
    raise ServiceError(f"TTS synthesis failed: {e}")

if not audio_chunks:
    raise ServiceError("TTS returned no audio data")
```

- [ ] **Step 5: Guard ffmpeg in `post_sales_service.py`**

```python
import subprocess

result = subprocess.run(
    ["ffmpeg", "-i", input_path, "-ar", "16000", "-ac", "1", output_path],
    capture_output=True, text=True, timeout=60
)
if result.returncode != 0:
    raise ServiceError(f"ffmpeg conversion failed: {result.stderr}")
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/fund_service.py backend/app/services/web_search_service.py backend/app/services/realtime_asr.py backend/app/services/speaker_clustering.py backend/app/services/tts_service.py backend/app/services/post_sales_service.py
git commit -m "fix(services): guard external API/process calls with error handling"
```

---

### Task 5: Guard DB queries — routers (part 1)

**Files:**
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/app/routers/chat.py`
- Modify: `backend/app/routers/customer.py`
- Modify: `backend/app/routers/feedback.py`
- Modify: `backend/app/routers/groups.py`
- Modify: `backend/app/routers/instructor.py`

- [ ] **Step 1: Add `get_or_404()` helper to `database.py`**

```python
from fastapi import HTTPException

def get_or_404(query_result, detail: str = "Resource not found"):
    """Raise 404 if query returned None, otherwise return the result."""
    if query_result is None:
        raise HTTPException(status_code=404, detail=detail)
    return query_result

def get_list_or_empty(query_result):
    """Return empty list if query returned None."""
    return query_result or []
```

- [ ] **Step 2: Replace bare `.first()` usage in each router**

Pattern for every `.first()` call:

```python
# Before
session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()

# After
session = get_or_404(
    db.query(TrainingSession).filter(TrainingSession.id == session_id).first(),
    detail="Training session not found"
)
```

Scan and fix each router file at all `.first()` call sites. Approximate counts:
- `auth.py`: 2 sites (user lookup by email, user lookup by id)
- `chat.py`: 1 site (knowledge doc lookup)
- `customer.py`: 8 sites (CRUD operations)
- `feedback.py`: 2 sites
- `groups.py`: 5 sites
- `instructor.py`: 3 sites

- [ ] **Step 3: Guard `.all()` with permission checks — add pattern**

For queries that filter by user_id with `apply_user_filter`:
```python
# Already filtered by apply_user_filter — just verify result is iterable
results = query.all()
return results or []  # empty list, not None
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/database.py backend/app/routers/auth.py backend/app/routers/chat.py backend/app/routers/customer.py backend/app/routers/feedback.py backend/app/routers/groups.py backend/app/routers/instructor.py
git commit -m "fix(routers): guard all DB .first() queries with get_or_404"
```

---

### Task 6: Guard DB queries — routers (part 2)

**Files:**
- Modify: `backend/app/routers/knowledge.py`
- Modify: `backend/app/routers/post_sales.py`
- Modify: `backend/app/routers/product.py`
- Modify: `backend/app/routers/quiz.py`
- Modify: `backend/app/routers/realtime.py`
- Modify: `backend/app/routers/training.py`

- [ ] **Step 1: Same pattern as Task 5 — guard all `.first()` calls**

Scan each file for `.first()` usage and add `get_or_404()`. Approximate counts:
- `knowledge.py`: 10 sites (categories + documents CRUD)
- `post_sales.py`: 6 sites
- `product.py`: 5 sites
- `quiz.py`: 4 sites
- `realtime.py`: 3 sites
- `training.py`: 7 sites

- [ ] **Step 2: Commit**

```bash
git add backend/app/routers/knowledge.py backend/app/routers/post_sales.py backend/app/routers/product.py backend/app/routers/quiz.py backend/app/routers/realtime.py backend/app/routers/training.py
git commit -m "fix(routers): guard remaining DB .first() queries with get_or_404"
```

---

### Task 7: Guard DB queries — service files

**Files:**
- Modify: `backend/app/services/realtime_service.py`
- Modify: `backend/app/services/audit_service.py`
- Modify: `backend/app/services/rag_service.py` (KB queries)
- Modify: `backend/app/utils/auth.py` (user queries)
- Modify: `backend/app/services/training_service.py` (KB queries)

- [ ] **Step 1: Same `get_or_404` / guard pattern for DB queries in services**

Services use `Session` directly. Apply the same null-guard pattern.

In `utils/auth.py`, guard user lookups:
```python
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # ... JWT decode ...
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/realtime_service.py backend/app/services/audit_service.py backend/app/services/rag_service.py backend/app/utils/auth.py backend/app/services/training_service.py
git commit -m "fix(services): guard DB queries in service and util files"
```

---

### Task 8: Input validation hardening

**Files:**
- Modify: `backend/app/routers/customer.py` (pagination, file uploads)
- Modify: `backend/app/routers/knowledge.py` (file upload MIME checks)
- Modify: `backend/app/routers/product.py` (pagination, fund_code)
- Modify: `backend/app/routers/chat.py` (pagination)
- Modify: `backend/app/schemas/`.py (add Field constraints where missing)

- [ ] **Step 1: Add pagination constraints to router query params**

Find every `page: int = 1` / `page_size: int = 20` and add constraints:

```python
from fastapi import Query

page: int = Query(1, ge=1, description="Page number")
page_size: int = Query(20, ge=1, le=100, description="Items per page")
```

Files to scan: `customer.py`, `knowledge.py`, `product.py`, `chat.py`, `training.py`, `post_sales.py`, `quiz.py`, `feedback.py`, `groups.py`, `instructor.py`.

- [ ] **Step 2: Add file upload MIME validation in knowledge.py**

```python
import filetype

ALLOWED_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

# In the upload endpoint:
contents = await file.read()
kind = filetype.guess(contents)
if kind is None or kind.mime not in ALLOWED_MIMES:
    raise HTTPException(status_code=400, detail=f"Unsupported file type: {kind.mime if kind else 'unknown'}")
```

- [ ] **Step 3: Add schema Field constraints for free-text fields**

Scan schemas for `str` fields without `min_length`/`max_length` and add reasonable constraints:

```python
# Before
name: str

# After
name: str = Field(..., min_length=1, max_length=255)
```

Do this for user-facing input schemas only (auth, knowledge, customer, product, training, post_sales, feedback, groups). Skip internal/response schemas.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/ backend/app/schemas/
git commit -m "fix: harden input validation — pagination bounds, MIME checks, string lengths"
```

---

### Task 9: Round 1 verification gate

- [ ] **Step 1: Start backend and verify no import errors**

Run: `cd backend && timeout 5 .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000 2>&1 || true`
Expected: `Application startup complete.` (or at least no import errors)

- [ ] **Step 2: Run E2E tests**

Run: `cd backend && python test_e2e.py`
Expected: all tests pass

- [ ] **Step 3: Fix any regressions**

If E2E fails, fix before proceeding.

---

## Round 2: Overcomplexity (Tasks 10-15)

### Task 10: Find and flatten single-implementation abstractions

**Files:** Scan all `backend/app/services/*.py` and `backend/app/utils/*.py`

- [ ] **Step 1: Scan for abstract classes / protocols with ≤1 concrete implementation**

```bash
cd backend && grep -rn "class.*ABC\|class.*Protocol\|@abstractmethod" app/
```

For each hit, check if there's only one concrete implementation. If yes, delete the abstract class and rename the concrete class to the abstract name.

Expected hits to evaluate:
- No known abstract classes exist in current codebase — verify with grep. If none found, skip this step.

- [ ] **Step 2: If nothing to flatten, note and skip**

If grep returns empty or all abstractions have ≥2 implementations, skip to Task 11.

- [ ] **Step 3: Commit** (only if changes were made)

---

### Task 11: Inline pass-through functions

**Files:** All `backend/app/services/*.py`, `backend/app/utils/*.py`

- [ ] **Step 1: Scan for functions ≤3 lines that only call another function**

Read through each service file manually. Pattern to find:

```python
def wrapper(x):
    return some_other_func(x)
```

Replace each call site of `wrapper(x)` with `some_other_func(x)` and delete `wrapper`.

- [ ] **Step 2: Key files to check**

- `services/rag_service.py` — check `_retrieve_knowledge()` and similar helpers
- `services/training_service.py` — check for thin wrappers around `_build_prompt()`
- `utils/auth.py` — check for thin wrappers around JWT operations

- [ ] **Step 3: Run E2E after each file's changes**

- [ ] **Step 4: Commit**

```bash
git add backend/app/
git commit -m "refactor(services): inline pass-through functions"
```

---

### Task 12: Deduplicate prompt templates

**Files:**
- Create: `backend/app/services/prompt_templates.py` (new)
- Modify: `backend/app/services/customer_service.py`
- Modify: `backend/app/services/training_service.py`
- Modify: `backend/app/services/allocation_service.py`
- Modify: `backend/app/services/post_sales_service.py`
- Modify: `backend/app/services/quiz_service.py`
- Modify: `backend/app/services/rag_service.py`
- Modify: `backend/app/services/trigger_engine.py`

- [ ] **Step 1: Extract common prompt fragments into `prompt_templates.py`**

```python
"""Shared prompt templates used across services. One source of truth."""

KB_FIRST_PREAMBLE = """请优先基于以下知识库内容进行分析和建议。
如果知识库中有相关信息，请引用并标注为📚基于知识库。
如果知识库中未覆盖，可结合你的专业知识补充并标注为💡AI分析。
严禁编造知识库中不存在的信息。"""

DISC_FRAMEWORK = """## 客户 DISC 性格参考
- D型（支配型）：给选择权，不要过多解释
- I型（影响型）：先建立关系，多用赞美
- S型（稳健型）：强调安全稳健，不要急于逼单
- C型（尽责型）：用数据说话，提供详细方案"""

SALES_COACH_PREAMBLE = """你是资深销售教练，请从以下4个维度提供反馈：
1. 策略建议
2. 话术矫正
3. 销售金句
4. 情绪感知"""
```

- [ ] **Step 2: Replace inline prompt strings in each service with imports**

```python
from app.services.prompt_templates import KB_FIRST_PREAMBLE, DISC_FRAMEWORK

# Replace the inline string literal with the imported constant
system_prompt = f"{KB_FIRST_PREAMBLE}\n\n{DISC_FRAMEWORK}\n\n{original_context}"
```

- [ ] **Step 3: Run E2E tests**

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/
git commit -m "refactor(services): extract shared prompt templates to prompt_templates.py"
```

---

### Task 13: Eliminate redundant intermediate variables

**Files:** All `backend/app/services/*.py`, `backend/app/routers/*.py`

- [ ] **Step 1: Scan for variables assigned then used exactly once on next line**

Pattern:

```python
# Before
result = some_func(data)
return result

# After
return some_func(data)


# Before
items = list(filter(lambda x: x.active, results))
processed = [item.name for item in items]
return processed

# After
return [item.name for item in filter(lambda x: x.active, results)]
```

- [ ] **Step 2: Apply to each file, re-run E2E after each**

Key files: `customer_service.py`, `training_service.py`, `allocation_service.py`, `post_sales_service.py`, `rag_service.py`

Rule: only inline if the variable name adds zero clarity. Keep descriptive variables that serve as documentation.

- [ ] **Step 3: Commit**

```bash
git add backend/app/
git commit -m "refactor: inline redundant intermediate variables"
```

---

### Task 14: Convert raw dicts to typed models (≥5 fixed keys)

**Files:** Scan all `backend/app/services/*.py` for `return {...}` with ≥5 keys

- [ ] **Step 1: Identify bare dict returns with ≥5 fixed keys**

Search in service files for functions returning dict literals with ≥5 keys. Check each hit:

If the dict is used as a return value to a router (and the router passes it to JSONResponse), and it has ≥5 fixed keys, create a Pydantic model for it.

If no qualifying dicts found (likely — most returns already use Pydantic schemas), skip.

- [ ] **Step 2: Commit** (only if changes were made)

---

### Task 15: Round 2 verification gate

- [ ] **Step 1: Start backend — no import errors**

- [ ] **Step 2: Run E2E tests — all pass**

- [ ] **Step 3: Commit round summary if needed, or move to Round 3**

---

## Round 3: Orthogonal Edits (Tasks 16-18)

### Task 16: Delete dead code

**Files:** All `backend/app/**/*.py`

- [ ] **Step 1: Find functions with zero callers**

For each non-export function (no leading underscore but not used outside its module), check callers:

```bash
cd backend && rg -rn "def [a-z]+_" app/ | head -50
```

Manually verify each against imports and usage within the file and across the project.

- [ ] **Step 2: Find unused classes**

```bash
cd backend && rg -rn "^class " app/
```

For each: grep the class name across `backend/app/` to verify usage. If unused, delete.

- [ ] **Step 3: Delete each dead item and run E2E**

Delete one at a time, re-run E2E after each deletion. This prevents accidentally removing something that's dynamically referenced.

- [ ] **Step 4: Check models for unused ORM models**

Scan `backend/app/models/` for models never imported or used in any router/service:

```bash
cd backend && for f in app/models/*.py; do
    name=$(basename "$f" .py)
    count=$(rg -l "$name" app/routers/ app/services/ app/utils/ | wc -l)
    echo "$name: $count references"
done
```

If any model has 0 references outside its own file, flag it. Don't delete (may be actively queried via SQLAlchemy dynamic lookups), but note for review.

- [ ] **Step 5: Commit**

```bash
git add backend/app/
git commit -m "chore: remove dead code — unused functions, classes, and imports"
```

---

### Task 17: Remove unused imports

**Files:** All `backend/app/**/*.py`

- [ ] **Step 1: Use ruff to find unused imports**

```bash
pip install ruff
cd backend && ruff check --select F401 app/ --output-format=concise
```

- [ ] **Step 2: Remove each reported unused import**

For each file with F401 violations, remove the unused import line.

- [ ] **Step 3: Verify no import errors**

```bash
cd backend && python -c "from app.main import app; print('OK')"
```

- [ ] **Step 4: Run E2E**

- [ ] **Step 5: Commit**

```bash
git add backend/app/
git commit -m "chore: remove unused imports"
```

---

### Task 18: Round 3 verification gate

- [ ] **Step 1: Start backend + run E2E**

---

## Round 4: Weak Verification (Tasks 19-21)

### Task 19: Strengthen test_e2e.py — status code and field assertions

**Files:**
- Modify: `test_e2e.py` (root of project)

- [ ] **Step 1: Add status code assertions to every API call**

Before pattern:
```python
resp = request("/api/health")
print(resp.read().decode())
```

After pattern:
```python
resp = request("/api/health")
assert resp.status == 200, f"Expected 200, got {resp.status}"
data = json.loads(resp.read().decode())
assert data["message"] == "AI Agent API is running"
```

Apply to every endpoint call in `test_e2e.py`.

- [ ] **Step 2: Add field presence assertions for CREATE responses**

```python
# After creating a resource:
data = json.loads(resp.read().decode())
assert "id" in data, f"Response missing 'id': {data}"
assert "created_at" in data or "created" in data, f"Response missing timestamp: {data}"
```

- [ ] **Step 3: Add list response shape assertions**

```python
# After GET listing endpoints:
data = json.loads(resp.read().decode())
assert isinstance(data, list) or "items" in data, f"Expected list or paginated response: {data}"
```

- [ ] **Step 4: Run E2E and fix any assertion failures**

Some endpoints may have different response shapes than expected — adjust assertions to match actual API.

- [ ] **Step 5: Commit**

```bash
git add test_e2e.py
git commit -m "test(e2e): add status code and field presence assertions to all endpoints"
```

---

### Task 20: Add auth boundary and 404 assertions

**Files:**
- Modify: `test_e2e.py`

- [ ] **Step 1: Add admin-only endpoint tests**

```python
# Test that non-admin user cannot access admin endpoints
def test_admin_endpoints_forbidden():
    # Login as salesperson
    resp = request("/api/auth/login", method="POST",
                   body=json.dumps({"username": "salesperson", "password": "test123"}).encode())
    assert resp.status == 200
    token = json.loads(resp.read().decode())["access_token"]

    admin_endpoints = [
        ("/api/admin/users", "GET"),
        ("/api/admin/feedback", "GET"),
        ("/api/groups", "POST"),
    ]
    for url, method in admin_endpoints:
        resp = request(url, method=method,
                       headers={"Authorization": f"Bearer {token}"})
        assert resp.status in [401, 403], f"{method} {url}: expected 401/403, got {resp.status}"
```

- [ ] **Step 2: Add 404 tests for non-existent UUIDs**

```python
import uuid

def test_not_found_returns_404():
    fake_id = str(uuid.uuid4())
    headers = {"Authorization": f"Bearer {token}"}

    endpoints = [
        f"/api/customers/{fake_id}",
        f"/api/products/{fake_id}",
        f"/api/training/sessions/{fake_id}",
        f"/api/post-sales/sessions/{fake_id}",
        f"/api/knowledge/categories/{fake_id}",
        f"/api/knowledge/documents/{fake_id}",
        f"/api/quiz/sessions/{fake_id}",
    ]
    for url in endpoints:
        resp = request(url, headers=headers)
        assert resp.status == 404, f"GET {url}: expected 404, got {resp.status}"
```

- [ ] **Step 3: Run E2E — all assertions pass**

- [ ] **Step 4: Commit**

```bash
git add test_e2e.py
git commit -m "test(e2e): add auth boundary and 404 assertions"
```

---

### Task 21: Final verification gate

- [ ] **Step 1: Full E2E run with all 4 rounds of changes**

```bash
cd backend && python test_e2e.py
```
Expected: all tests pass, ~60+ assertions

- [ ] **Step 2: Count assertions**

```bash
cd backend && grep -c "assert " test_e2e.py
```
Expected: 50-70 (up from ~15 baseline)

- [ ] **Step 3: Backend starts cleanly**

```bash
cd backend && timeout 8 .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000 2>&1 || true
```
Expected: `Application startup complete.` with no import or config errors.

- [ ] **Step 4: Final commit if any last fixes**

---

## Summary

| Round | Tasks | Files touched (est.) | Commits |
|-------|-------|---------------------|---------|
| 1. Assumption Mgmt | 1-9 | 25 | 7 |
| 2. Overcomplexity | 10-15 | 15 | 4 |
| 3. Orthogonal Edits | 16-18 | 5-10 | 2 |
| 4. Weak Verification | 19-21 | 1 | 2 |
| **Total** | **21** | **~55** | **15** |
