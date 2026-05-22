"""Security headers middleware — adds HSTS, CSP, anti-clickjacking, etc."""


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def _send(message):
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                headers.setdefault(b"strict-transport-security", b"max-age=31536000; includeSubDomains")
                headers.setdefault(b"x-content-type-options", b"nosniff")
                headers.setdefault(b"x-frame-options", b"DENY")
                headers.setdefault(b"x-xss-protection", b"1; mode=block")
                headers.setdefault(b"referrer-policy", b"strict-origin-when-cross-origin")
                headers.setdefault(b"cache-control", b"no-store, max-age=0")
                headers.setdefault(b"permissions-policy", b"camera=(), microphone=(), geolocation=()")
                headers.setdefault(
                    b"content-security-policy",
                    b"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
                )
                message["headers"] = list(headers.items())
            await send(message)

        await self.app(scope, receive, _send)
