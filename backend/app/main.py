from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from .config import settings, check_secret_key
from .database import engine, Base
from .routers import knowledge, customer, chat, product, training, auth, instructor, post_sales, feedback, groups, realtime
from .middleware.rate_limit import RateLimitMiddleware

# Security: ensure JWT secret is not the default value
check_secret_key()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Sales Assistant", version="0.1.0")

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:5175").split(",")

# Rate limiter: 5/min login, 60/min global per IP
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins + ["https://tauri.localhost", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])
app.include_router(customer.router, prefix="/api/customers", tags=["customers"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(product.router, prefix="/api/products", tags=["products"])
app.include_router(training.router, prefix="/api/training", tags=["training"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(instructor.router, prefix="/api/instructor", tags=["instructor"])
app.include_router(post_sales.router, prefix="/api/post-sales", tags=["post-sales"])
app.include_router(feedback.router, prefix="/api", tags=["feedback"])
app.include_router(groups.router, prefix="/api", tags=["groups"])
app.include_router(realtime.router, tags=["realtime"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
