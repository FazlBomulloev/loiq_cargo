"""tariff_rows: режим «за м³» + новая сетка Кашгар/Урумчи/Иу

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-28

"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# бракеты — (density_from, density_to|None, rate_per_kg|None, rate_per_m3|None)
KASHGAR_ROWS = [
    (Decimal("0"),    Decimal("201"),  None,             Decimal("195.0000")),
    (Decimal("201"),  Decimal("251"),  Decimal("0.9500"), None),
    (Decimal("251"),  Decimal("301"),  Decimal("0.9000"), None),
    (Decimal("301"),  Decimal("401"),  Decimal("0.8500"), None),
    (Decimal("401"),  Decimal("501"),  Decimal("0.8000"), None),
    (Decimal("501"),  Decimal("601"),  Decimal("0.7500"), None),
    (Decimal("601"),  Decimal("701"),  Decimal("0.7000"), None),
    (Decimal("701"),  Decimal("801"),  Decimal("0.6500"), None),
    (Decimal("801"),  Decimal("901"),  Decimal("0.6000"), None),
    (Decimal("901"),  Decimal("1001"), Decimal("0.5500"), None),
    (Decimal("1001"), None,            Decimal("0.5000"), None),
]

URUMQI_ROWS = [
    (Decimal("0"),    Decimal("201"),  None,             Decimal("200.0000")),
    (Decimal("201"),  Decimal("251"),  Decimal("1.0000"), None),
    (Decimal("251"),  Decimal("301"),  Decimal("0.9500"), None),
    (Decimal("301"),  Decimal("401"),  Decimal("0.9000"), None),
    (Decimal("401"),  Decimal("501"),  Decimal("0.8500"), None),
    (Decimal("501"),  Decimal("601"),  Decimal("0.8000"), None),
    (Decimal("601"),  Decimal("701"),  Decimal("0.7500"), None),
    (Decimal("701"),  Decimal("801"),  Decimal("0.7000"), None),
    (Decimal("801"),  Decimal("901"),  Decimal("0.6500"), None),
    (Decimal("901"),  Decimal("1001"), Decimal("0.6000"), None),
    (Decimal("1001"), None,            Decimal("0.5500"), None),
]

YIWU_ROWS = [
    (Decimal("0"),    Decimal("201"),  None,             Decimal("235.0000")),
    (Decimal("201"),  Decimal("251"),  Decimal("1.2000"), None),
    (Decimal("251"),  Decimal("301"),  Decimal("1.1500"), None),
    (Decimal("301"),  Decimal("401"),  Decimal("1.1000"), None),
    (Decimal("401"),  Decimal("501"),  Decimal("1.0500"), None),
    (Decimal("501"),  Decimal("601"),  Decimal("1.0000"), None),
    (Decimal("601"),  Decimal("701"),  Decimal("0.9500"), None),
    (Decimal("701"),  Decimal("801"),  Decimal("0.9000"), None),
    (Decimal("801"),  Decimal("901"),  Decimal("0.8500"), None),
    (Decimal("901"),  Decimal("1001"), Decimal("0.8000"), None),
    (Decimal("1001"), None,            Decimal("0.7500"), None),
]

WAREHOUSE_ROWS = {
    "kashgar": KASHGAR_ROWS,
    "urumqi": URUMQI_ROWS,
    "yiwu": YIWU_ROWS,
}

NEW_NOTE = "Плотностная сетка 2026-08 · порог 200 кг/м³ за м³"


def upgrade() -> None:
    op.add_column(
        "tariff_rows",
        sa.Column(
            "rate_usd_per_m3", sa.Numeric(8, 4), nullable=True
        ),
    )
    op.alter_column(
        "tariff_rows",
        "rate_usd_per_kg",
        existing_type=sa.Numeric(8, 4),
        nullable=True,
    )
    op.drop_constraint(
        "ck_tariff_rows_rate_positive",
        "tariff_rows",
        type_="check",
    )
    op.create_check_constraint(
        "ck_tariff_rows_rate_positive",
        "tariff_rows",
        "(rate_usd_per_kg IS NOT NULL AND rate_usd_per_kg > 0)"
        " OR (rate_usd_per_m3 IS NOT NULL AND rate_usd_per_m3 > 0)",
    )
    op.create_check_constraint(
        "ck_tariff_rows_rate_single_mode",
        "tariff_rows",
        "NOT (rate_usd_per_kg IS NOT NULL"
        "     AND rate_usd_per_m3 IS NOT NULL)",
    )

    _reseed(op.get_bind())


def _reseed(bind) -> None:
    now = datetime.now(timezone.utc)
    warehouses = bind.execute(
        sa.text(
            "SELECT id, code FROM warehouses "
            "WHERE code IN ('kashgar', 'urumqi', 'yiwu')"
        )
    ).fetchall()
    wh_by_code = {row.code: row.id for row in warehouses}

    for code, rows in WAREHOUSE_ROWS.items():
        wid = wh_by_code.get(code)
        if wid is None:
            continue

        bind.execute(
            sa.text(
                "UPDATE tariffs SET is_active = false "
                "WHERE warehouse_id = :wid"
            ),
            {"wid": wid},
        )

        tariff_id = bind.execute(
            sa.text(
                """
                INSERT INTO tariffs
                    (warehouse_id, effective_from, is_active,
                     currency, note, created_at, updated_at)
                VALUES
                    (:wid, :now, true, 'USD',
                     :note, :now, :now)
                RETURNING id
                """
            ),
            {"wid": wid, "now": now, "note": NEW_NOTE},
        ).scalar_one()

        for d_from, d_to, rate_kg, rate_m3 in rows:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO tariff_rows
                        (tariff_id, density_from, density_to,
                         rate_usd_per_kg, rate_usd_per_m3)
                    VALUES
                        (:tid, :df, :dt, :rkg, :rm3)
                    """
                ),
                {
                    "tid": tariff_id,
                    "df": d_from,
                    "dt": d_to,
                    "rkg": rate_kg,
                    "rm3": rate_m3,
                },
            )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM tariff_rows WHERE rate_usd_per_m3 IS NOT NULL"
        )
    )
    op.drop_constraint(
        "ck_tariff_rows_rate_single_mode",
        "tariff_rows",
        type_="check",
    )
    op.drop_constraint(
        "ck_tariff_rows_rate_positive",
        "tariff_rows",
        type_="check",
    )
    op.create_check_constraint(
        "ck_tariff_rows_rate_positive",
        "tariff_rows",
        "rate_usd_per_kg > 0",
    )
    op.alter_column(
        "tariff_rows",
        "rate_usd_per_kg",
        existing_type=sa.Numeric(8, 4),
        nullable=False,
    )
    op.drop_column("tariff_rows", "rate_usd_per_m3")
