"""add bio avatar to users

Revision ID: d7296664e51d
Revises: a8b9c0d1e2f3
Create Date: 2026-05-29 16:55:00.594097

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd7296664e51d'
down_revision: Union[str, Sequence[str], None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('bio', sa.String(length=200), nullable=True))
    op.add_column('users', sa.Column('avatar', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar')
    op.drop_column('users', 'bio')
