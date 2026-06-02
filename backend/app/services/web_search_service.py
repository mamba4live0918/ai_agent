import concurrent.futures
from duckduckgo_search import DDGS

from app.config import ServiceError


def web_search_finance(query: str, max_results: int = 3) -> str:
    """Search the web for financial product information via DuckDuckGo.
    Returns a formatted text block or empty string on failure/timeout.
    """
    if not query.strip():
        return ""

    search_query = f"{query} 理财产品 详情 风险 收益"

    def _search():
        try:
            with DDGS() as ddgs:
                return list(ddgs.text(search_query, max_results=max_results, region="cn-zh"))
        except Exception as e:
            raise ServiceError(f"Web search API failed: {e}")

    try:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(_search)
            results = future.result(timeout=8)
    except ServiceError:
        raise
    except concurrent.futures.TimeoutError:
        raise ServiceError("Web search API request timed out after 8s")
    except Exception as e:
        raise ServiceError(f"Web search API request failed: {e}")

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
