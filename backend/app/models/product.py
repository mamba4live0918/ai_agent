import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..database import Base


class ProductType(str, enum.Enum):
    insurance = "保险"
    fund = "基金"
    wealth = "理财"
    trust = "信托"
    structured = "结构化"
    other = "其他"


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    risk_level: Mapped[int] = mapped_column(Integer, nullable=False)
    expected_return: Mapped[float] = mapped_column(Float, nullable=False)
    min_investment: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    issuer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    target_tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    lock_period: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fund_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    nav_history: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="simulated")
    nav_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
