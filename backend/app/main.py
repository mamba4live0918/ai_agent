from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os

from .config import settings, check_secret_key
from .database import engine, Base
from .routers import knowledge, customer, chat, product, training, auth, instructor, sales_assistance
from .middleware.rate_limit import RateLimitMiddleware
from .middleware.security_headers import SecurityHeadersMiddleware

# Security: ensure JWT secret is not the default value
check_secret_key()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Sales Assistant", version="0.1.0")

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:5175").split(",")

MAX_UPLOAD_BYTES = settings.max_upload_mb * 1024 * 1024


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_UPLOAD_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body too large. Max {MAX_UPLOAD_BYTES // (1024*1024)} MB."},
            )
    return await call_next(request)


# Order matters: rate limiter → security headers → size limit → CORS
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])
app.include_router(customer.router, prefix="/api/customers", tags=["customers"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(product.router, prefix="/api/products", tags=["products"])
app.include_router(training.router, prefix="/api/training", tags=["training"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(instructor.router, prefix="/api/instructor", tags=["instructor"])
app.include_router(sales_assistance.router, prefix="/api/sales-assistance", tags=["sales-assistance"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
