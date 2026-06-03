"""
Market data service using akshare for Chinese financial products.

Data sources (all via akshare):
- fund_name_em()                     — all fund names, codes, types (~20K funds)
- fund_individual_basic_info_xq()    — fund detail (company, manager, rating, etc.)
- fund_open_fund_daily_em()          — daily NAV for a given fund code
- fund_rating_all()                  — fund ratings from multiple agencies
- bond_zh_hs_daily()                 — Chinese government bond yields

Refresh policy: 2-hour cache per fund code.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ---- Cache ----
_cache: dict[str, dict] = {}  # fund_code -> {data, fetched_at}
CACHE_TTL = timedelta(hours=2)


def _cache_get(fund_code: str) -> Optional[dict]:
    """Return cached fund data if still fresh (< 2 hours)."""
    entry = _cache.get(fund_code)
    if entry is None:
        return None
    if datetime.utcnow() - entry["fetched_at"] > CACHE_TTL:
        return None
    return entry["data"]


def _cache_set(fund_code: str, data: dict) -> None:
    _cache[fund_code] = {"data": data, "fetched_at": datetime.utcnow()}


# ---- Fund list / browse / search ----

def _get_fund_list_df():
    """Load fund list from akshare, cached for 24 hours."""
    import akshare as ak

    cache_key = "__fund_list__"
    entry = _cache.get(cache_key)
    if entry and datetime.utcnow() - entry["fetched_at"] < timedelta(hours=24):
        return entry["data"]

    try:
        df = ak.fund_name_em()
    except Exception:
        logger.exception("Failed to fetch fund list from akshare")
        return None
    _cache[cache_key] = {"data": df, "fetched_at": datetime.utcnow()}
    return df


def search_funds(keyword: str, limit: int = 20) -> list[dict]:
    """Search all Chinese mutual funds by keyword (name or code)."""
    df = _get_fund_list_df()
    if df is None:
        return []

    kw = keyword.lower()
    mask = df["基金简称"].str.lower().str.contains(kw, na=False) | \
           df["基金代码"].str.lower().str.contains(kw, na=False)
    matched = df[mask].head(limit)

    results = []
    for _, row in matched.iterrows():
        raw_type = str(row.get("基金类型", ""))
        results.append({
            "fund_code": str(row["基金代码"]),
            "name": str(row["基金简称"]),
            "type": _fund_type_label(raw_type),
            "company": "",  # fund_name_em doesn't include company; use fetch_fund_detail for that
        })
    return results


def list_market_funds(category: str = "all", page: int = 1, page_size: int = 20) -> dict:
    """Return a paginated list of market funds, optionally filtered by category.

    Categories: all, stock (股票型), mix (混合型), bond (债券型), index (指数型), qdii, money (货币型)
    """
    df = _get_fund_list_df()
    if df is None:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 0}

    # Apply category filter
    if category != "all":
        type_map = {
            "stock": "股票",
            "mix": "混合",
            "bond": "债券",
            "index": "指数",
            "qdii": "QDII",
            "money": "货币",
        }
        type_keyword = type_map.get(category, category)
        df = df[df["基金类型"].str.contains(type_keyword, na=False)]

    total = len(df)
    start = (page - 1) * page_size
    page_df = df.iloc[start:start + page_size]

    items = []
    for _, row in page_df.iterrows():
        raw_type = str(row.get("基金类型", ""))
        items.append({
            "fund_code": str(row["基金代码"]),
            "name": str(row["基金简称"]),
            "type": _fund_type_label(raw_type),
            "raw_type": raw_type,
            "company": "",  # not available in fund_name_em
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


# ---- Fund Detail (fills ProductCreate fields) ----

def fetch_fund_detail(fund_code: str) -> Optional[dict]:
    """Fetch complete fund details for product creation.

    Returns dict with keys matching ProductCreate schema:
    name, type, risk_level, expected_return, min_investment,
    description, issuer, fund_code, nav_history
    """
    cached = _cache_get(fund_code)
    if cached:
        return cached

    import akshare as ak

    result = {}

    # 1. Basic info via fund_individual_basic_info_xq (company, manager, rating, etc.)
    try:
        df_info = ak.fund_individual_basic_info_xq(symbol=fund_code)
        info_map = {}
        for _, row in df_info.iterrows():
            info_map[str(row["item"])] = str(row["value"]) if row["value"] else ""

        result["name"] = info_map.get("基金名称") or info_map.get("基金全称") or f"基金{fund_code}"
        result["issuer"] = info_map.get("基金公司", "")
        result["description"] = (
            f"{info_map.get('基金类型', '')} | "
            f"{info_map.get('基金全称', result['name'])} | "
            f"基金经理: {info_map.get('基金经理', '未知')} | "
            f"成立: {info_map.get('成立时间', '未知')} | "
            f"规模: {info_map.get('最新规模', '未知')} | "
            f"评级: {info_map.get('基金评级', '未知')}"
        )
        raw_type = info_map.get("基金类型", "")
    except Exception:
        logger.warning("Failed to fetch basic info for %s, using fund_name_em fallback", fund_code)
        # Fallback to fund_name_em
        df_all = ak.fund_name_em()
        match = df_all[df_all["基金代码"].astype(str) == fund_code]
        if not match.empty:
            row = match.iloc[0]
            result["name"] = str(row["基金简称"])
            raw_type = str(row.get("基金类型", ""))
            result["issuer"] = ""
            result["description"] = f"{raw_type}"
        else:
            result["name"] = f"基金{fund_code}"
            raw_type = ""
            result["issuer"] = ""
            result["description"] = ""

    result["type"] = _fund_type_label(raw_type)
    result["risk_level"] = _infer_risk_level(raw_type)

    # 2. NAV history (past 12 months) via fund_open_fund_daily_em
    try:
        df_nav = ak.fund_open_fund_daily_em(symbol=fund_code)
        if df_nav is not None and not df_nav.empty:
            df_nav = df_nav.sort_values("净值日期", ascending=False)
            recent = df_nav.head(250)  # ~1 year of trading days
            nav_history = []
            for _, row in recent.iterrows():
                date_val = row["净值日期"]
                if hasattr(date_val, "strftime"):
                    date_str = date_val.strftime("%Y-%m-%d")
                else:
                    date_str = str(date_val)[:10]
                nav_history.append({
                    "date": date_str,
                    "nav": round(float(row["单位净值"]), 4),
                    "return_rate": round(float(row.get("日增长率", 0) or 0), 2),
                })
            result["nav_history"] = list(reversed(nav_history))  # ascending by date
    except Exception:
        logger.warning("Failed to fetch NAV for %s", fund_code)
        result["nav_history"] = None

    # 3. Annualized return from NAV data
    if result.get("nav_history") and len(result["nav_history"]) > 20:
        navs = result["nav_history"]
        oldest = navs[0]["nav"]
        newest = navs[-1]["nav"]
        if oldest > 0:
            years = max(len(navs) / 250, 0.5)
            result["expected_return"] = round(
                ((newest / oldest) ** (1 / years) - 1) * 100, 2
            )
        else:
            result["expected_return"] = 0.0
    else:
        result["expected_return"] = 0.0

    # 4. Min investment
    result["min_investment"] = 1.0

    # 5. Fund code + source
    result["fund_code"] = fund_code
    result["source"] = "akshare"

    _cache_set(fund_code, result)
    return result


# ---- Bond yield data (for bond products) ----

def fetch_bond_yields() -> list[dict]:
    """Fetch Chinese government bond yield curve."""
    import akshare as ak

    try:
        df = ak.bond_zh_hs_daily()
        if df is None or df.empty:
            return []
        results = []
        for _, row in df.tail(20).iterrows():
            results.append({
                "date": str(row.get("日期", ""))[:10],
                "yield_1y": float(row.get("1年", 0) or 0),
                "yield_5y": float(row.get("5年", 0) or 0),
                "yield_10y": float(row.get("10年", 0) or 0),
            })
        return results
    except Exception:
        logger.exception("Failed to fetch bond yields")
        return []


# ---- Helpers ----

def _fund_type_label(raw_type: str) -> str:
    """Convert akshare fund type string to Product type enum value."""
    t = raw_type
    if "股票" in t or "指数" in t:
        return "基金"
    if "混合" in t:
        return "基金"
    if "债券" in t:
        return "基金"
    if "货币" in t:
        return "基金"
    if "qdii" in t:
        return "基金"
    if "etf" in t or "lof" in t:
        return "基金"
    if "保险" in t:
        return "保险"
    if "信托" in t:
        return "信托"
    if "理财" in t:
        return "理财"
    if "结构化" in t:
        return "结构化"
    return "其他"


def _infer_risk_level(fund_type: str) -> int:
    """Infer risk level (1-5) from fund type."""
    mapping = {
        "货币型": 1,
        "债券型": 2,
        "混合型": 3,
        "股票型": 4,
        "指数型": 4,
        "QDII": 4,
        "ETF": 4,
        "理财": 2,
        "保险": 2,
        "信托": 4,
        "结构化": 5,
    }
    for key, level in mapping.items():
        if key in fund_type:
            return level
    return 3  # default moderate
