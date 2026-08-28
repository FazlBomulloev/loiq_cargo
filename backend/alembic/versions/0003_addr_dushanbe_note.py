"""warehouses.address + goods.dushanbe_note

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-28

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "warehouses",
        sa.Column("address", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "goods",
        sa.Column(
            "dushanbe_note", sa.String(length=512), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("goods", "dushanbe_note")
    op.drop_column("warehouses", "address")
