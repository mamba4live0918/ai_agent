"""add category parent_id for hierarchical support

Revision ID: a8b9c0d1e2f3
Revises: 75f76790b138
Create Date: 2026-05-28 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, Sequence[str], None] = '75f76790b138'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('categories', sa.Column(
        'parent_id', sa.UUID(), nullable=True
    ))
    op.create_foreign_key(
        'fk_categories_parent_id_categories',
        'categories', 'categories',
        ['parent_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_categories_parent_id', 'categories', ['parent_id'])


def downgrade() -> None:
    op.drop_index('ix_categories_parent_id', table_name='categories')
    op.drop_constraint('fk_categories_parent_id_categories', 'categories', type_='foreignkey')
    op.drop_column('categories', 'parent_id')
