"""make products user_id nullable — admin products become shared (NULL = base)

Revision ID: 3e4f5d6a7b8c
Revises: 2b3c4d5e6f7a
Create Date: 2026-05-21 15:16:38
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '3e4f5d6a7b8c'
down_revision = '2b3c4d5e6f7a'
branch_labels = None
depends_on = None


def upgrade():
    # Make column nullable first
    op.alter_column('products', 'user_id', nullable=True)
    # Set admin-owned products to NULL (shared/base)
    op.execute("""
        UPDATE products SET user_id = NULL
        WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')
    """)


def downgrade():
    # Set NULL products back to a default admin — pick first admin
    op.execute("""
        UPDATE products SET user_id = (
            SELECT id FROM users WHERE role = 'admin' LIMIT 1
        )
        WHERE user_id IS NULL
    """)
    op.alter_column('products', 'user_id', nullable=False)
