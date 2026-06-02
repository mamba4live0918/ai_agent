from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from fastapi import HTTPException

from .config import settings

engine = create_engine(settings.database_url, echo=False)
SessionLocal = sessionmaker(engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_or_404(query_result, detail: str = "Resource not found"):
    """Raise 404 if query returned None, otherwise return the result."""
    if query_result is None:
        raise HTTPException(status_code=404, detail=detail)
    return query_result


def get_list_or_empty(query_result):
    """Return empty list if query returned None."""
    return query_result or []
