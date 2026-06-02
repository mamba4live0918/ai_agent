"""E2E test for AI Sales Assistant - tests all API modules."""
import json
import urllib.request
import urllib.error
import sys
import traceback

BASE = "http://localhost:8000/api"
PASS = 0
FAIL = 0
TOKEN = None
CREATED_IDS = {"customers": [], "categories": [], "quiz_sessions": [], "training_sessions": [], "groups": []}

def request(method, path, body=None, expect_status=None):
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            if expect_status and resp.status != expect_status:
                return None, f"Expected status {expect_status}, got {resp.status}"
            content = resp.read().decode()
            return json.loads(content) if content else {}, None
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        if expect_status and e.code == expect_status:
            return json.loads(body_text) if body_text else {}, None
        return None, f"HTTP {e.code}: {body_text[:200]}"
    except Exception as e:
        return None, str(e)

def validate_exists(result, *keys):
    for key in keys:
        if key not in result:
            raise AssertionError(f"Missing key: {key}")

def validate_value(result, key, expected):
    val = result.get(key)
    if val != expected:
        raise AssertionError(f"Expected {key}={expected}, got {val}")

def test(name, method, path, body=None, expect_status=None, checks=None):
    global PASS, FAIL
    print(f"  [{name}] ...", end=" ", flush=True)
    result, error = request(method, path, body, expect_status)
    if error:
        FAIL += 1
        print(f"FAIL: {error}")
        return None
    if checks:
        try:
            checks(result)
        except AssertionError as e:
            FAIL += 1
            print(f"FAIL (validation): {e}")
            return result
        except Exception as e:
            FAIL += 1
            print(f"FAIL (exception): {e}")
            return result
    PASS += 1
    print("OK")
    return result

# ─── Auth ───
print("\n=== Auth ===")
r = test("login", "POST", "/auth/login", {"username": "admin", "password": "admin123"})
if r:
    TOKEN = r["access_token"]
    test("login returns user+token", "POST", "/auth/login",
         {"username": "admin", "password": "admin123"},
         checks=lambda r: validate_exists(r, "access_token", "user"))
else:
    print("CRITICAL: Cannot login, skipping remaining tests")
    sys.exit(1)

test("register new user", "POST", "/auth/register",
     {"username": "e2e_regression", "email": "e2e_reg@test.local", "password": "test123"},
     checks=lambda r: validate_value(r.get("user", {}), "username", "e2e_regression"))

test("get current user", "GET", "/auth/me",
     checks=lambda r: validate_value(r, "username", "admin"))

# ─── Knowledge Base ───
print("\n=== Knowledge Base ===")
cats = test("list categories", "GET", "/knowledge/categories",
            checks=lambda r: None if isinstance(r, list) else (_ for _ in ()).throw(AssertionError("not a list")))

new_cat = test("create category", "POST", "/knowledge/categories",
               {"name": "e2e_test_cat", "description": "E2E regression test"},
               checks=lambda r: validate_value(r, "name", "e2e_test_cat"))
if new_cat:
    CREATED_IDS["categories"].append(new_cat["id"])

test("create duplicate category fails", "POST", "/knowledge/categories",
     {"name": "e2e_test_cat", "description": "Duplicate test"},
     expect_status=400)

# Get first category with icon for icon tests
if cats and len(cats) > 0:
    cat0 = cats[0]
    test(f"get category icon (no icon)", "GET", f"/knowledge/categories/icons/nonexistent.png", expect_status=404)

test("list documents", "GET", "/knowledge/documents?page=1&page_size=5",
     checks=lambda r: validate_exists(r, "items", "total"))

# ─── Quiz ───
print("\n=== Quiz ===")
quiz = test("create quiz (choice)", "POST", "/quiz/sessions",
            {"category_id": None, "document_ids": None, "question_count": 2, "question_types": ["choice"]})
if quiz:
    validate_exists(quiz, "id", "status", "questions")
    validate_value(quiz, "status", "active")
    if len(quiz["questions"]) == 2:
        CREATED_IDS["quiz_sessions"].append(quiz["id"])
        q1 = quiz["questions"][0]
        test("answer quiz choice", "POST", f"/quiz/sessions/{quiz['id']}/answers",
             {"question_id": q1["id"], "user_answer": "A"})

test("list quiz sessions", "GET", "/quiz/sessions",
     checks=lambda r: None if isinstance(r, list) else (_ for _ in ()).throw(AssertionError("not a list")))

# ─── Customer Analysis ───
print("\n=== Customer Analysis ===")
test("list customers", "GET", "/customers?page=1&page_size=3",
     checks=lambda r: validate_exists(r, "items", "total"))

new_cust = test("create customer", "POST", "/customers",
                {"name": "e2e_test_customer"},
                checks=lambda r: validate_value(r, "name", "e2e_test_customer"))
if new_cust:
    CREATED_IDS["customers"].append(new_cust["id"])
    test("get customer detail", "GET", f"/customers/{new_cust['id']}",
         checks=lambda r: validate_value(r, "id", new_cust["id"]))
    test("analyze customer", "POST", "/customers/analyze",
         {"raw_text": "35岁IT工程师，年薪60万"})

# ─── Products ───
print("\n=== Products ===")
test("list products", "GET", "/products?page=1&page_size=3",
     checks=lambda r: validate_exists(r, "items", "total"))

# ─── Training ───
print("\n=== Training ===")
test("list training sessions", "GET", "/training/sessions?page=1&page_size=5",
     checks=lambda r: validate_exists(r, "items", "total"))

if CREATED_IDS["customers"]:
    cust_id = CREATED_IDS["customers"][0]
    train_sess = test("create training session", "POST", "/training/sessions",
                      {"customer_id": cust_id, "scenario": "产品讲解"})
    if train_sess:
        CREATED_IDS["training_sessions"].append(train_sess["id"])

# ─── Post-Sales ───
print("\n=== Post-Sales ===")
test("list post-sales sessions", "GET", "/post-sales/sessions?page=1&page_size=5",
     checks=lambda r: validate_exists(r, "items", "total"))

# ─── Chat ───
print("\n=== Chat ===")
test("list conversations", "GET", "/chat/conversations",
     checks=lambda r: None if isinstance(r, list) else (_ for _ in ()).throw(AssertionError("not a list")))

# ─── Feedback ───
print("\n=== Feedback ===")
test("get my feedback", "GET", "/feedback/my",
     checks=lambda r: None if isinstance(r, list) else (_ for _ in ()).throw(AssertionError("not a list")))
test("get feedback stats", "GET", "/feedback/stats",
     checks=lambda r: validate_exists(r, "total", "average"))
test("submit feedback", "POST", "/feedback",
     {"rating": 5, "category": "e2e", "comment": "E2E regression test"},
     checks=lambda r: validate_value(r, "rating", 5))

# ─── Admin ───
print("\n=== Admin ===")
test("list users (admin)", "GET", "/auth/users?page=1&page_size=5",
     checks=lambda r: validate_exists(r, "total", "items"))

# ─── Groups ───
print("\n=== Groups ===")
test("list groups", "GET", "/groups?page=1&page_size=5",
     checks=lambda r: validate_exists(r, "total", "items"))
new_group = test("create group", "POST", "/groups",
                 {"name": "e2e_test_group", "description": "E2E regression"},
                 checks=lambda r: validate_value(r, "name", "e2e_test_group"))
if new_group:
    CREATED_IDS["groups"].append(new_group["id"])

# ─── Instructor ───
print("\n=== Instructor ===")
test("instructor overview", "GET", "/instructor/statistics/overview",
     checks=lambda r: validate_exists(r, "total_users", "total_sessions"))
test("instructor per-user stats", "GET", "/instructor/statistics/per-user",
     checks=lambda r: None if isinstance(r, list) else (_ for _ in ()).throw(AssertionError("not a list")))
test("instructor trends", "GET", "/instructor/statistics/trends?granularity=weekly",
     checks=lambda r: None if isinstance(r, list) else (_ for _ in ()).throw(AssertionError("not a list")))

# ─── Realtime ───
print("\n=== Realtime ===")
test("list realtime sessions", "GET", "/realtime/sessions?page=1&page_size=5",
     checks=lambda r: validate_exists(r, "total", "items"))

# ─── Cleanup ───
print("\n=== Cleanup ===")
for cat_id in CREATED_IDS["categories"]:
    test(f"delete category", "DELETE", f"/knowledge/categories/{cat_id}", expect_status=204)

for quiz_id in CREATED_IDS["quiz_sessions"]:
    test(f"delete quiz session", "DELETE", f"/quiz/sessions/{quiz_id}", expect_status=204)

for cust_id in CREATED_IDS["customers"]:
    test(f"delete customer", "DELETE", f"/customers/{cust_id}", expect_status=204)

for sess_id in CREATED_IDS["training_sessions"]:
    test(f"delete training session", "DELETE", f"/training/sessions/{sess_id}", expect_status=204)

for gid in CREATED_IDS["groups"]:
    test(f"delete group", "DELETE", f"/groups/{gid}", expect_status=204)

# Cleanup test user
users_resp, _ = request("GET", "/auth/users?page=1&page_size=50")
if users_resp:
    for u in users_resp.get("items", []):
        if u.get("username") == "e2e_regression":
            test(f"delete test user", "DELETE", f"/auth/users/{u['id']}", expect_status=204)
            break

# ─── Summary ───
total = PASS + FAIL
print(f"\n{'='*50}")
print(f"  TOTAL: {PASS} passed, {FAIL} failed out of {total} tests")
if FAIL > 0:
    print(f"  RESULT: FAILURE")
    sys.exit(1)
else:
    print(f"  RESULT: SUCCESS")
