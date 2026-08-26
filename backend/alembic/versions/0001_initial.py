"""начальная схема + сид складов, тарифов и настроек

Revision ID: 0001
Revises:
Create Date: 2026-08-26

"""
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


USER_ROLE = postgresql.ENUM(
    "china_staff", "dushanbe_staff", "owner",
    name="user_role", create_type=False,
)
WAREHOUSE_CODE = postgresql.ENUM(
    "yiwu", "urumqi", "kashgar",
    name="warehouse_code", create_type=False,
)
GOODS_STATUS = postgresql.ENUM(
    "in_china",
    "in_transit",
    "in_dushanbe",
    "delivered",
    name="goods_status", create_type=False,
)
SHIPMENT_STATUS = postgresql.ENUM(
    "draft", "in_transit", "arrived", "closed",
    name="shipment_status", create_type=False,
)
CHANGE_REQUEST_STATUS = postgresql.ENUM(
    "pending", "applied", "rejected",
    name="change_request_status", create_type=False,
)
CHANGE_REQUEST_ACTION = postgresql.ENUM(
    "edit_goods",
    "delete_goods",
    "other",
    name="change_request_action", create_type=False,
)
TG_STATUS = postgresql.ENUM(
    "not_started",
    "pending",
    "verified",
    name="telegram_verification_status", create_type=False,
)
PAYMENT_STATUS = postgresql.ENUM(
    "unpaid", "paid", "debt",
    name="payment_status", create_type=False,
)


def _create_enums(bind) -> None:
    """Создаём enum-типы через сырой SQL с IF NOT EXISTS,
    т.к. sa.Enum.create() не поддерживает такой синтаксис."""
    defs = [
        ("user_role", ["china_staff", "dushanbe_staff", "owner"]),
        ("warehouse_code", ["yiwu", "urumqi", "kashgar"]),
        (
            "goods_status",
            ["in_china", "in_transit", "in_dushanbe", "delivered"],
        ),
        (
            "shipment_status",
            ["draft", "in_transit", "arrived", "closed"],
        ),
        (
            "change_request_status",
            ["pending", "applied", "rejected"],
        ),
        (
            "change_request_action",
            ["edit_goods", "delete_goods", "other"],
        ),
        (
            "telegram_verification_status",
            ["not_started", "pending", "verified"],
        ),
        ("payment_status", ["unpaid", "paid", "debt"]),
    ]
    for name, values in defs:
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM pg_type WHERE typname = :n"
            ),
            {"n": name},
        ).scalar()
        if exists:
            continue
        joined = ", ".join(f"'{v}'" for v in values)
        bind.execute(
            sa.text(f"CREATE TYPE {name} AS ENUM ({joined})")
        )


def upgrade() -> None:
    bind = op.get_bind()
    _create_enums(bind)

    op.create_table(
        "warehouses",
        sa.Column(
            "id",
            sa.BigInteger,
            primary_key=True,
            autoincrement=True,
        ),
        sa.Column(
            "code", WAREHOUSE_CODE, nullable=False, unique=True
        ),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column(
            "is_source",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "truck_volume_m3",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="30.00",
        ),
        sa.Column(
            "truck_weight_kg",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="20000.00",
        ),
        sa.Column(
            "multiplier",
            sa.Numeric(6, 3),
            nullable=False,
            server_default="1.000",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "email",
            sa.String(160),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", USER_ROLE, nullable=False),
        sa.Column(
            "warehouse_id",
            sa.BigInteger,
            sa.ForeignKey(
                "warehouses.id",
                ondelete="RESTRICT",
                name="fk_users_warehouse_id_warehouses",
            ),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "clients",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "client_code",
            sa.String(16),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column(
            "phone",
            sa.String(32),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("city", sa.String(80), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "telegram_chat_id",
            sa.BigInteger,
            nullable=True,
            unique=True,
        ),
        sa.Column(
            "telegram_verification_code",
            sa.String(12),
            nullable=True,
            unique=True,
        ),
        sa.Column(
            "telegram_status",
            TG_STATUS,
            nullable=False,
            server_default="not_started",
        ),
        sa.Column(
            "telegram_verified_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "tariffs",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "warehouse_id",
            sa.BigInteger,
            sa.ForeignKey(
                "warehouses.id",
                ondelete="CASCADE",
                name="fk_tariffs_warehouse_id_warehouses",
            ),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "effective_from",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "currency",
            sa.String(3),
            nullable=False,
            server_default="USD",
        ),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "tariff_rows",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "tariff_id",
            sa.BigInteger,
            sa.ForeignKey(
                "tariffs.id",
                ondelete="CASCADE",
                name="fk_tariff_rows_tariff_id_tariffs",
            ),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "density_from", sa.Numeric(8, 2), nullable=False
        ),
        sa.Column("density_to", sa.Numeric(8, 2), nullable=True),
        sa.Column(
            "rate_usd_per_kg", sa.Numeric(8, 4), nullable=False
        ),
        sa.CheckConstraint(
            "density_to IS NULL OR density_to > density_from",
            name="ck_tariff_rows_density_range_valid",
        ),
        sa.CheckConstraint(
            "rate_usd_per_kg > 0",
            name="ck_tariff_rows_rate_positive",
        ),
    )

    op.create_table(
        "shipments",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "number",
            sa.String(32),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column(
            "warehouse_id",
            sa.BigInteger,
            sa.ForeignKey(
                "warehouses.id",
                ondelete="RESTRICT",
                name="fk_shipments_warehouse_id_warehouses",
            ),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "status",
            SHIPMENT_STATUS,
            nullable=False,
            server_default="draft",
            index=True,
        ),
        sa.Column(
            "departed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "arrived_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "truck_volume_m3", sa.Numeric(10, 2), nullable=True
        ),
        sa.Column(
            "truck_weight_kg", sa.Numeric(12, 2), nullable=True
        ),
        sa.Column(
            "total_volume_m3",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_weight_kg",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_cost_usd",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("fill_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "goods",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "client_id",
            sa.BigInteger,
            sa.ForeignKey(
                "clients.id",
                ondelete="SET NULL",
                name="fk_goods_client_id_clients",
            ),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "warehouse_id",
            sa.BigInteger,
            sa.ForeignKey(
                "warehouses.id",
                ondelete="RESTRICT",
                name="fk_goods_warehouse_id_warehouses",
            ),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "shipment_id",
            sa.BigInteger,
            sa.ForeignKey(
                "shipments.id",
                ondelete="SET NULL",
                name="fk_goods_shipment_id_shipments",
            ),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "received_by_id",
            sa.BigInteger,
            sa.ForeignKey(
                "users.id",
                ondelete="SET NULL",
                name="fk_goods_received_by_id_users",
            ),
            nullable=True,
        ),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("weight_kg", sa.Numeric(10, 2), nullable=False),
        sa.Column("volume_m3", sa.Numeric(10, 3), nullable=False),
        sa.Column(
            "density_kg_m3", sa.Numeric(10, 2), nullable=False
        ),
        sa.Column(
            "rate_usd_per_kg", sa.Numeric(8, 4), nullable=True
        ),
        sa.Column(
            "freight_cost_usd", sa.Numeric(12, 2), nullable=True
        ),
        sa.Column(
            "status",
            GOODS_STATUS,
            nullable=False,
            server_default="in_china",
            index=True,
        ),
        sa.Column(
            "is_unclaimed",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
            index=True,
        ),
        sa.Column(
            "is_missing",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "arrived_in_dushanbe_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "delivered_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "storage_days_free",
            sa.Integer,
            nullable=False,
            server_default="10",
        ),
        sa.Column(
            "storage_fee_somoni",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "payment_status",
            PAYMENT_STATUS,
            nullable=False,
            server_default="unpaid",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "weight_kg > 0", name="ck_goods_weight_positive"
        ),
        sa.CheckConstraint(
            "volume_m3 > 0", name="ck_goods_volume_positive"
        ),
    )

    op.create_table(
        "change_requests",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "author_id",
            sa.BigInteger,
            sa.ForeignKey(
                "users.id",
                ondelete="RESTRICT",
                name="fk_change_requests_author_id_users",
            ),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "goods_id",
            sa.BigInteger,
            sa.ForeignKey(
                "goods.id",
                ondelete="SET NULL",
                name="fk_change_requests_goods_id_goods",
            ),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "action", CHANGE_REQUEST_ACTION, nullable=False
        ),
        sa.Column(
            "payload",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "status",
            CHANGE_REQUEST_STATUS,
            nullable=False,
            server_default="pending",
            index=True,
        ),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column(
            "decided_by_id",
            sa.BigInteger,
            sa.ForeignKey(
                "users.id",
                ondelete="SET NULL",
                name="fk_change_requests_decided_by_id_users",
            ),
            nullable=True,
        ),
        sa.Column(
            "decided_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("decision_note", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "settings",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "key",
            sa.String(64),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("value", postgresql.JSONB, nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    _seed(bind)


def _seed(bind) -> None:
    now = datetime.now(timezone.utc)

    warehouses = [
        {
            "code": "kashgar",
            "name": "Кашгар",
            "multiplier": Decimal("1.000"),
            "truck_volume_m3": Decimal("30.00"),
            "truck_weight_kg": Decimal("20000.00"),
        },
        {
            "code": "urumqi",
            "name": "Урумчи",
            "multiplier": Decimal("1.100"),
            "truck_volume_m3": Decimal("30.00"),
            "truck_weight_kg": Decimal("20000.00"),
        },
        {
            "code": "yiwu",
            "name": "Иу",
            "multiplier": Decimal("1.300"),
            "truck_volume_m3": Decimal("30.00"),
            "truck_weight_kg": Decimal("20000.00"),
        },
    ]

    wh_ids: dict[str, int] = {}
    for w in warehouses:
        res = bind.execute(
            sa.text(
                """
                INSERT INTO warehouses
                    (code, name, is_source, truck_volume_m3,
                     truck_weight_kg, multiplier,
                     created_at, updated_at)
                VALUES
                    (:code, :name, true, :vol, :wt, :mul,
                     :now, :now)
                RETURNING id
                """
            ),
            {
                "code": w["code"],
                "name": w["name"],
                "vol": w["truck_volume_m3"],
                "wt": w["truck_weight_kg"],
                "mul": w["multiplier"],
                "now": now,
            },
        )
        wh_ids[w["code"]] = res.scalar_one()

    base_rows = [
        (Decimal("250"), None, Decimal("0.7000")),
        (Decimal("150"), Decimal("250"), Decimal("1.3000")),
        (Decimal("100"), Decimal("150"), Decimal("2.5000")),
        (Decimal("50"), Decimal("100"), Decimal("3.0000")),
        (Decimal("0"), Decimal("50"), Decimal("4.0000")),
    ]

    for w in warehouses:
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
            {
                "wid": wh_ids[w["code"]],
                "now": now,
                "note": (
                    "стартовая сетка "
                    f"({w['name']}, коэф. {w['multiplier']})"
                ),
            },
        ).scalar_one()

        for d_from, d_to, base_rate in base_rows:
            rate = (base_rate * w["multiplier"]).quantize(
                Decimal("0.0001")
            )
            bind.execute(
                sa.text(
                    """
                    INSERT INTO tariff_rows
                        (tariff_id, density_from,
                         density_to, rate_usd_per_kg)
                    VALUES
                        (:tid, :df, :dt, :rate)
                    """
                ),
                {
                    "tid": tariff_id,
                    "df": d_from,
                    "dt": d_to,
                    "rate": rate,
                },
            )

    defaults = [
        (
            "burning_days_threshold",
            20,
            "N дней до пометки товара «горящим»",
        ),
        (
            "fill_target_pct",
            90,
            "порог заполненности фуры (объём ИЛИ вес), %",
        ),
        (
            "target_cost_usd",
            27000,
            "целевая стоимость полной фуры, $",
        ),
        (
            "density_quota_dense_pct",
            40,
            "квота плотного груза (≥250 кг/м³), % объёма",
        ),
        (
            "density_quota_medium_pct",
            35,
            "квота среднего груза (100–249), % объёма",
        ),
        (
            "density_quota_light_pct",
            25,
            "квота лёгкого груза (<100), % объёма",
        ),
        (
            "free_storage_days",
            10,
            "дней бесплатного хранения в Душанбе",
        ),
        (
            "storage_daily_coef_somoni",
            5.0,
            "стоимость дня простоя (сомони), placeholder",
        ),
        (
            "exchange_rate_somoni_per_usd",
            10.98,
            "курс: 1 USD = X сомони",
        ),
    ]
    for key, value, desc in defaults:
        bind.execute(
            sa.text(
                """
                INSERT INTO settings
                    (key, value, description,
                     created_at, updated_at)
                VALUES
                    (:k, CAST(:v AS JSONB), :d, :now, :now)
                """
            ),
            {
                "k": key,
                "v": json.dumps(value),
                "d": desc,
                "now": now,
            },
        )


def downgrade() -> None:
    op.drop_table("settings")
    op.drop_table("change_requests")
    op.drop_table("goods")
    op.drop_table("shipments")
    op.drop_table("tariff_rows")
    op.drop_table("tariffs")
    op.drop_table("clients")
    op.drop_table("users")
    op.drop_table("warehouses")

    bind = op.get_bind()
    for name in (
        "payment_status",
        "telegram_verification_status",
        "change_request_action",
        "change_request_status",
        "shipment_status",
        "goods_status",
        "warehouse_code",
        "user_role",
    ):
        bind.execute(sa.text(f"DROP TYPE IF EXISTS {name}"))
