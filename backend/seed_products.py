"""Seed product library with top 200 Chinese mutual funds.

Uses fund_individual_basic_info_xq (xueqiu source) for fund details
and East Money HTTP for NAV history (urllib, not requests).
"""
import sys, time
sys.path.insert(0, ".")

from datetime import datetime
from app.database import SessionLocal
from app.models.product import Product
from app.services.market_service import fetch_fund_detail

# Top 200 popular Chinese mutual funds (well-known, actively traded)
# Covers: stock, mix, bond, index, QDII, money market
TOP_200_FUNDS = [
    # === 货币型 (Money Market) — 5 ===
    "000343", "000638", "000359", "000330", "000615",
    # === 债券型 (Bond) — 30 ===
    "000014", "000015", "000024", "000027", "000032",
    "000033", "000037", "000047", "000053", "000054",
    "000064", "000065", "000069", "000084", "000085",
    "000090", "000092", "000093", "000104", "000105",
    "000118", "000119", "000122", "000125", "000126",
    "000132", "000133", "000139", "000140", "000147",
    # === 混合型 (Mix/Balanced) — 60 ===
    "000001", "000011", "000031", "000061", "000083",
    "000117", "000124", "000136", "000173", "000209",
    "000220", "000242", "000251", "000259", "000263",
    "000279", "000294", "000308", "000311", "000339",
    "000362", "000390", "000409", "000410", "000431",
    "000452", "000462", "000471", "000477", "000480",
    "000522", "000527", "000529", "000541", "000547",
    "000554", "000566", "000574", "000577", "000586",
    "000595", "000601", "000603", "000612", "000619",
    "000628", "000632", "000652", "000663", "000689",
    "000696", "000697", "000698", "000711", "000727",
    "000742", "000746", "000751", "000761", "000778",
    # === 股票型 (Stock) — 50 ===
    "000031", "000059", "000071", "000083", "000124",
    "000173", "000220", "000251", "000309", "000362",
    "000390", "000409", "000410", "000418", "000431",
    "000452", "000471", "000472", "000480", "000529",
    "000541", "000547", "000566", "000574", "000577",
    "000586", "000595", "000601", "000603", "000619",
    "000628", "000652", "000663", "000689", "000696",
    "000697", "000698", "000711", "000727", "000746",
    "000751", "000761", "000778", "000793", "000800",
    "000828", "000831", "000854", "000867", "000878",
    # === 指数型 (Index) — 30 ===
    "510050", "510300", "510500", "510880", "510900",
    "512100", "512480", "512880", "513050", "513100",
    "515050", "515790", "516160", "518880", "519300",
    "159915", "159919", "159920", "159922", "159925",
    "159928", "159930", "159939", "159949", "159952",
    "159967", "159977", "159985", "159992", "159995",
    # === QDII — 20 ===
    "000041", "000043", "000044", "000071", "000072",
    "000103", "000179", "000180", "000193", "000274",
    "000290", "000294", "000342", "000369", "000370",
    "000391", "000393", "000404", "000405", "000410",
    # === 热门明星基金 — 35 (extra well-known funds) ===
    "110011", "005827", "161725", "320007", "001632",
    "002001", "163402", "519068", "000577", "000619",
    "001475", "002692", "003834", "004450", "005310",
    "006098", "007119", "008086", "008120", "009548",
    "010271", "011103", "012079", "013502", "014123",
    "015209", "016058", "017890", "018910", "019520",
    "020001", "020005", "020011", "160505", "160607",
]

# Deduplicate
TOP_200_FUNDS = list(dict.fromkeys(TOP_200_FUNDS))
print(f"Total unique fund codes: {len(TOP_200_FUNDS)}")

# ---- Step 1: Clear existing products ----
print("\n=== Step 1: Clear existing products ===")
db = SessionLocal()
count = db.query(Product).count()
db.query(Product).delete()
db.commit()
print(f"Deleted {count} products")

# ---- Step 2: Import top funds ----
print("\n=== Step 2: Import top 200 funds ===\n")
imported = 0
failed = 0

for i, fund_code in enumerate(TOP_200_FUNDS):
    print(f"[{i+1}/{len(TOP_200_FUNDS)}] {fund_code}...", end=" ")
    sys.stdout.flush()

    detail = fetch_fund_detail(fund_code)
    if detail is None or not detail.get("name"):
        failed += 1
        print("SKIP (no data)")
        continue

    try:
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
            user_id=None,
        )
        db.add(product)
        db.flush()
        imported += 1
        print(f"OK — {detail['name'][:25]} | R{detail['risk_level']} | {detail['expected_return']}%")
    except Exception as e:
        db.rollback()
        failed += 1
        print(f"ERROR: {e}")
        continue

    if (i + 1) % 20 == 0:
        db.commit()
        print(f"  --- committed {imported} so far ---")

    time.sleep(0.15)  # rate limit

db.commit()
db.close()

# ---- Summary ----
print(f"\n=== Done: {imported} imported, {failed} failed ===")

db2 = SessionLocal()
from sqlalchemy import func
total = db2.query(Product).count()
breakdown = db2.query(Product.type, func.count(Product.id)).group_by(Product.type).all()
print(f"\nTotal products in DB: {total}")
print("By type:")
for t, c in breakdown:
    print(f"  {t}: {c}")

# Show sample
samples = db2.query(Product).limit(5).all()
print("\nSample products:")
for p in samples:
    print(f"  {p.fund_code} | {p.name[:30]} | {p.type} | R{p.risk_level} | {p.issuer or 'N/A'}")
db2.close()
