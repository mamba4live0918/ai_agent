"""add users table and multi-tenancy

Revision ID: 2b3c4d5e6f7a
Revises: 1a1e21404804
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid
import bcrypt

revision = "2b3c4d5e6f7a"
down_revision = "1a1e21404804"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Create users table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("username", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="salesperson"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    # 2. Add nullable user_id columns to existing tables
    op.add_column("customers", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("products", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("documents", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("training_sessions", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))

    # 3. Handle existing data: create default admin user and assign existing rows
    conn = op.get_bind()

    # Check if any existing data needs migration
    customer_count = conn.execute(sa.text("SELECT COUNT(*) FROM customers")).scalar()
    product_count = conn.execute(sa.text("SELECT COUNT(*) FROM products")).scalar()
    doc_count = conn.execute(sa.text("SELECT COUNT(*) FROM documents")).scalar()
    session_count = conn.execute(sa.text("SELECT COUNT(*) FROM training_sessions")).scalar()
    has_existing = customer_count > 0 or product_count > 0 or doc_count > 0 or session_count > 0

    if has_existing:
        admin_id = str(uuid.uuid4())
        default_password = bcrypt.hashpw("admin123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        conn.execute(
            sa.text(
                "INSERT INTO users (id, username, email, hashed_password, role) "
                "VALUES (:id, :username, :email, :password, :role)"
            ),
            {"id": admin_id, "username": "admin", "email": "admin@system.local", "password": default_password, "role": "admin"},
        )
        conn.execute(sa.text("UPDATE customers SET user_id = :uid"), {"uid": admin_id})
        conn.execute(sa.text("UPDATE products SET user_id = :uid"), {"uid": admin_id})
        conn.execute(sa.text("UPDATE documents SET user_id = :uid"), {"uid": admin_id})
        conn.execute(sa.text("UPDATE training_sessions SET user_id = :uid"), {"uid": admin_id})

    # 4. Add foreign keys and NOT NULL constraints (documents stays nullable for base docs)
    op.create_foreign_key("fk_customers_user", "customers", "users", ["user_id"], ["id"])
    op.create_foreign_key("fk_products_user", "products", "users", ["user_id"], ["id"])
    op.create_foreign_key("fk_documents_user", "documents", "users", ["user_id"], ["id"])
    op.create_foreign_key("fk_training_sessions_user", "training_sessions", "users", ["user_id"], ["id"])

    op.alter_column("customers", "user_id", nullable=False)
    op.alter_column("products", "user_id", nullable=False)
    op.alter_column("training_sessions", "user_id", nullable=False)
    # documents.user_id stays nullable (NULL = base document)

    # 5. Create indexes
    op.create_index("ix_customers_user_id", "customers", ["user_id"])
    op.create_index("ix_products_user_id", "products", ["user_id"])
    op.create_index("ix_documents_user_id", "documents", ["user_id"])
    op.create_index("ix_training_sessions_user_id", "training_sessions", ["user_id"])


def downgrade():
    op.drop_index("ix_training_sessions_user_id")
    op.drop_index("ix_documents_user_id")
    op.drop_index("ix_products_user_id")
    op.drop_index("ix_customers_user_id")

    op.drop_constraint("fk_training_sessions_user", "training_sessions")
    op.drop_constraint("fk_documents_user", "documents")
    op.drop_constraint("fk_products_user", "products")
    op.drop_constraint("fk_customers_user", "customers")

    op.drop_column("training_sessions", "user_id")
    op.drop_column("documents", "user_id")
    op.drop_column("products", "user_id")
    op.drop_column("customers", "user_id")

    op.drop_table("users")
