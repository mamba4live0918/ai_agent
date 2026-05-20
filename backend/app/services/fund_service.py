import re
import json
from datetime import datetime
import urllib.request
import urllib.error


def fetch_fund_nav(fund_code: str) -> list[dict] | None:
    """Fetch 12-month NAV history from East Money for a given fund code.
    Returns list of {date, nav, return_rate} or None on failure."""
    try:
        url = f"http://fund.eastmoney.com/pingzhongdata/{fund_code}.js"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "http://fund.eastmoney.com/",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode("utf-8")

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

    except Exception:
        return None
