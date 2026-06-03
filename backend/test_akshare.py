"""Smoke test: akshare market data fetch."""
import sys
sys.path.insert(0, ".")

print("=== Test 1: Search funds ===")
from app.services.market_service import search_funds

results = search_funds("易方达", limit=5)
print(f"Search '易方达': {len(results)} results")
for r in results:
    print(f"  {r['fund_code']}  {r['name'][:30]}  {r['type']}  {r['company']}")

assert len(results) > 0, "Should find at least 1 result for '易方达'"
print("[PASS] Search works\n")

print("=== Test 2: Fund detail (110011 - 易方达优质精选混合) ===")
from app.services.market_service import fetch_fund_detail

detail = fetch_fund_detail("110011")
assert detail is not None, "Should return data for 110011"
print(f"  name: {detail.get('name')}")
print(f"  type: {detail.get('type')}")
print(f"  issuer: {detail.get('issuer')}")
print(f"  risk_level: {detail.get('risk_level')}")
print(f"  expected_return: {detail.get('expected_return')}%")
print(f"  nav_history entries: {len(detail.get('nav_history') or [])}")

nav = detail.get("nav_history") or []
if nav:
    print(f"  First NAV: {nav[0]}")
    print(f"  Last NAV:  {nav[-1]}")

assert detail.get("name"), "Should have fund name"
print("[PASS] Detail fetch works\n")

print("=== Test 3: Browse market funds ===")
from app.services.market_service import list_market_funds

browse = list_market_funds(category="all", page=1, page_size=5)
print(f"  Total funds: {browse['total']}, Page: {browse['page']}/{browse['total_pages']}")
for item in browse["items"]:
    print(f"  {item['fund_code']}  {item['name'][:30]}  {item['raw_type']}  {item['company']}")

assert len(browse["items"]) > 0, "Should have browse results"
assert browse["total"] > 1000, f"Should have many funds, got {browse['total']}"
print("[PASS] Browse works\n")

print("=== Test 4: Browse by category ===")
browse_bond = list_market_funds(category="bond", page=1, page_size=5)
print(f"  Bond funds: {browse_bond['total']} total")
for item in browse_bond["items"]:
    print(f"  {item['fund_code']}  {item['name'][:30]}  {item['raw_type']}")
assert browse_bond["total"] > 0, "Should have bond funds"
print("[PASS] Category filter works\n")

print("=== Test 5: Dual-source NAV (fund_service) ===")
from app.services.fund_service import fetch_fund_nav

nav_result = fetch_fund_nav("110011")
assert nav_result and len(nav_result) > 0, "Should have NAV data from dual source"
print(f"  NAV entries: {len(nav_result)}")
print(f"  First: {nav_result[0]}")
print(f"  Last:  {nav_result[-1]}")
print("[PASS] Dual-source NAV works\n")

print("=" * 40)
print("ALL TESTS PASSED")
