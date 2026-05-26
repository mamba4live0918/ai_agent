from duckduckgo_search import DDGS


def web_search_finance(query: str, max_results: int = 5) -> str:
    """Search the web for financial product information via DuckDuckGo.

    Returns a formatted text block suitable for injection into an LLM prompt.
    Returns empty string on failure.
    """
    if not query.strip():
        return ""

    search_query = f"{query} 理财产品 详情 风险 收益"

    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(search_query, max_results=max_results, region="cn-zh"))
    except Exception:
        return ""

    if not results:
        return ""

    lines = ["📡 网络实时数据（共 {} 条）:".format(len(results))]
    for i, r in enumerate(results, 1):
        title = r.get("title", "无标题")
        body = r.get("body", "")
        href = r.get("href", "")
        lines.append(f"  {i}. {title}")
        if body:
            lines.append(f"     {body[:200]}")
        if href:
            lines.append(f"     {href}")

    return "\n".join(lines)
