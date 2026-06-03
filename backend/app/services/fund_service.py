"""
Fund NAV data service — dual-source with akshare as primary.

Priority: akshare (fund_open_fund_daily_em) -> East Money (fallback)
AKShare provides daily NAV with higher granularity (up to 250 trading days).
East Money serves as backup when akshare is unavailable.
"""

import re
import json
import logging
from datetime import datetime
import urllib.request
import urllib.error

from ..config import ServiceError

logger = logging.getLogger(__name__)


def _fetch_nav_akshare(fund_code: str) -> list[dict] | None:
    """Fetch NAV history via akshare (primary source)."""
    try:
        from .market_service import fetch_fund_detail
        detail = fetch_fund_detail(fund_code)
        if detail and detail.get("nav_history"):
            return detail["nav_history"]
    except Exception:
        logger.warning("akshare NAV fetch failed for %s, falling back to East Money", fund_code)
    return None


def _fetch_nav_eastmoney(fund_code: str) -> list[dict] | None:
    """Fetch 12-month NAV history from East Money for a given fund code.

    Returns list of {date, nav, return_rate} or None on failure.
    """
    try:
        url = f"http://fund.eastmoney.com/pingzhongdata/{fund_code}.js"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "http://fund.eastmoney.com/",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise ServiceError(f"EastMoney API returned HTTP {e.code}")
    except urllib.error.URLError as e:
        raise ServiceError(f"EastMoney API request failed: {e.reason}")

    # Extract Data_netWorthTrend from JS
    match = re.search(r"Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);", text)
    if not match:
        return None

    raw = json.loads(match.group(1))
    if not raw:
        return None

    # Take last 12 months of data
    entries = raw[-250:] if len(raw) > 250 else raw
    # Sample ~12 points (one per month-ish)
    step = max(1, len(entries) // 12)
    sampled = entries[::step][-12:]

    result = []
    for entry in sampled:
        ts = entry.get("x") or entry.get("x_Timestamp")
        if isinstance(ts, (int, float)):
            date = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")
        else:
            date = str(ts)[:10]
        nav = entry["y"]
        result.append({
            "date": date,
            "nav": round(nav, 4),
            "return_rate": round((nav - 1.0) * 100, 2),
        })

    return result if result else None


def fetch_fund_nav(fund_code: str) -> list[dict] | None:
    """Fetch 12-month NAV history — akshare primary, East Money fallback."""
    result = _fetch_nav_akshare(fund_code)
    if result:
        return result
    return _fetch_nav_eastmoney(fund_code)
