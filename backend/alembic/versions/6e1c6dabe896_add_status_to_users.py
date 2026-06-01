"""add status to users

Revision ID: 6e1c6dabe896
Revises: d7296664e51d
Create Date: 2026-05-29 16:59:09.249591

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '6e1c6dabe896'
down_revision: Union[str, Sequence[str], None] = 'd7296664e51d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('status', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'status')
