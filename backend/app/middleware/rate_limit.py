import json
import time
from collections import defaultdict
from starlette.types import ASGIApp, Scope, Receive, Send


class RateLimitMiddleware:
    """Simple in-memory sliding-window rate limiter. Pure ASGI, no BaseHTTPMiddleware issues."""

    def __init__(self, app: ASGIApp):
        self.app = app
        self._window = 60  # seconds
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def _clean(self, key: str, now: float) -> list[float]:
        cutoff = now - self._window
        self._buckets[key] = [t for t in self._buckets[key] if t > cutoff]
        return self._buckets[key]

    def _is_allowed(self, key: str, max_requests: int) -> bool:
        now = time.time()
        if len(self._clean(key, now)) >= max_requests:
            return False
        self._buckets[key].append(now)
        return True

    async def _send_429(self, send: Send, detail: str):
        body = json.dumps({"detail": detail}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 429,
            "headers": [(b"content-type", b"application/json")],
        })
        await send({
            "type": "http.response.body",
            "body": body,
        })

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Get client IP
        client = scope.get("client")
        client_ip = client[0] if client else "unknown"

        # Login endpoint: 5/min per IP
        if scope.get("path") == "/api/auth/login":
            if not self._is_allowed(f"login:{client_ip}", 5):
                await self._send_429(send, "Too many login attempts. Please try again later.")
                return

        # Global: 60/min per IP
        if not self._is_allowed(f"global:{client_ip}", 60):
            await self._send_429(send, "Rate limit exceeded. Please slow down.")
            return

        await self.app(scope, receive, send)
