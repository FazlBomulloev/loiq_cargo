from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Goods,
    GoodsStatus,
    Warehouse,
)
from app.services import settings_service

DENSE_MIN = Decimal("250")
MEDIUM_MIN = Decimal("100")

MONEY = Decimal("0.01")
VOLUME = Decimal("0.001")
WEIGHT = Decimal("0.01")
PCT = Decimal("0.01")

Group = Literal["dense", "medium", "light"]
Reason = Literal["burning", "quota", "topup", "manual", "excluded"]


def _group_of(density: Decimal) -> Group:
    if density >= DENSE_MIN:
        return "dense"
    if density >= MEDIUM_MIN:
        return "medium"
    return "light"


@dataclass(slots=True)
class Candidate:
    goods: Goods
    density_group: Group
    age_days: int
    is_burning: bool
    reason: Reason = "topup"


@dataclass(slots=True)
class Bag:
    volume: Decimal = Decimal("0")
    weight: Decimal = Decimal("0")
    cost: Decimal = Decimal("0")
    ids: set[int] = field(default_factory=set)

    def add(self, c: Candidate) -> None:
        self.volume += Decimal(c.goods.volume_m3)
        self.weight += Decimal(c.goods.weight_kg)
        self.cost += Decimal(c.goods.freight_cost_usd or 0)
        self.ids.add(c.goods.id)

    def fits(
        self, c: Candidate, truck_vol: Decimal, truck_wt: Decimal
    ) -> bool:
        if c.goods.id in self.ids:
            return False
        new_vol = self.volume + Decimal(c.goods.volume_m3)
        new_wt = self.weight + Decimal(c.goods.weight_kg)
        return new_vol <= truck_vol and new_wt <= truck_wt


@dataclass(slots=True)
class GroupStats:
    volume: Decimal
    weight: Decimal
    quota: Decimal
    quota_pct: int
    count: int


@dataclass(slots=True)
class PlanResult:
    warehouse: Warehouse
    truck_volume: Decimal
    truck_weight: Decimal
    target_cost_usd: Decimal
    fill_target_pct: int
    burning_days: int

    total_volume: Decimal
    total_weight: Decimal
    total_cost: Decimal
    fill_pct: Decimal

    selected: list[Candidate]
    left_behind: list[Candidate]
    groups: dict[Group, GroupStats]


async def _load_candidates(
    session: AsyncSession,
    warehouse_id: int,
    burning_days: int,
    now: datetime,
) -> list[Candidate]:
    stmt = (
        select(Goods)
        .where(
            Goods.warehouse_id == warehouse_id,
            Goods.status == GoodsStatus.IN_CHINA,
            Goods.shipment_id.is_(None),
        )
        .options(selectinload(Goods.client))
        .order_by(Goods.received_at.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    out: list[Candidate] = []
    for g in rows:
        age = (now - g.received_at).days
        out.append(
            Candidate(
                goods=g,
                density_group=_group_of(Decimal(g.density_kg_m3)),
                age_days=age,
                is_burning=age >= burning_days,
            )
        )
    return out


def _fill_pct(
    bag: Bag, truck_vol: Decimal, truck_wt: Decimal
) -> Decimal:
    vol_pct = (bag.volume / truck_vol * 100) if truck_vol else Decimal("0")
    wt_pct = (bag.weight / truck_wt * 100) if truck_wt else Decimal("0")
    return max(vol_pct, wt_pct).quantize(PCT, rounding=ROUND_HALF_UP)


async def build_plan(
    session: AsyncSession,
    warehouse: Warehouse,
    truck_vol_override: Decimal | None = None,
    truck_wt_override: Decimal | None = None,
    include_ids: list[int] | None = None,
    exclude_ids: list[int] | None = None,
) -> PlanResult:
    burning_days = int(
        await settings_service.get_value(
            session, "burning_days_threshold", 20
        )
    )
    fill_target = int(
        await settings_service.get_value(
            session, "fill_target_pct", 90
        )
    )
    target_cost = Decimal(
        str(
            await settings_service.get_value(
                session, "target_cost_usd", 27000
            )
        )
    )
    quota_dense = int(
        await settings_service.get_value(
            session, "density_quota_dense_pct", 40
        )
    )
    quota_medium = int(
        await settings_service.get_value(
            session, "density_quota_medium_pct", 35
        )
    )
    quota_light = int(
        await settings_service.get_value(
            session, "density_quota_light_pct", 25
        )
    )

    truck_vol = (
        truck_vol_override
        if truck_vol_override is not None
        else Decimal(warehouse.truck_volume_m3)
    )
    truck_wt = (
        truck_wt_override
        if truck_wt_override is not None
        else Decimal(warehouse.truck_weight_kg)
    )

    now = datetime.now(timezone.utc)
    candidates = await _load_candidates(
        session, warehouse.id, burning_days, now
    )
    by_id = {c.goods.id: c for c in candidates}
    excluded = set(exclude_ids or [])
    manual = set(include_ids or [])

    bag = Bag()

    if include_ids is not None:
        selected_ids: set[int] = set()
        for gid in include_ids:
            if gid in selected_ids:
                continue
            c = by_id.get(gid)
            if c is None:
                continue
            c.reason = "manual"
            bag.add(c)
            selected_ids.add(gid)

        selected = [by_id[i] for i in selected_ids if i in by_id]
        selected.sort(key=lambda c: c.goods.received_at)
        leftover = [
            c for c in candidates
            if c.goods.id not in selected_ids
        ]
        for c in leftover:
            if c.goods.id in excluded:
                c.reason = "excluded"
        groups = _group_stats(
            selected, truck_vol,
            quota_dense, quota_medium, quota_light,
        )
        fill_pct = _fill_pct(bag, truck_vol, truck_wt)
        return PlanResult(
            warehouse=warehouse,
            truck_volume=truck_vol,
            truck_weight=truck_wt,
            target_cost_usd=target_cost,
            fill_target_pct=fill_target,
            burning_days=burning_days,
            total_volume=bag.volume.quantize(
                VOLUME, rounding=ROUND_HALF_UP
            ),
            total_weight=bag.weight.quantize(
                WEIGHT, rounding=ROUND_HALF_UP
            ),
            total_cost=bag.cost.quantize(
                MONEY, rounding=ROUND_HALF_UP
            ),
            fill_pct=fill_pct,
            selected=selected,
            left_behind=leftover,
            groups=groups,
        )

    pool = [c for c in candidates if c.goods.id not in excluded]

    burning = [c for c in pool if c.is_burning]
    burning.sort(key=lambda c: c.goods.received_at)
    for c in burning:
        if bag.fits(c, truck_vol, truck_wt):
            c.reason = "burning"
            bag.add(c)

    quotas: dict[Group, Decimal] = {
        "dense": truck_vol * Decimal(quota_dense) / 100,
        "medium": truck_vol * Decimal(quota_medium) / 100,
        "light": truck_vol * Decimal(quota_light) / 100,
    }
    used_by_group: dict[Group, Decimal] = {
        "dense": Decimal("0"),
        "medium": Decimal("0"),
        "light": Decimal("0"),
    }
    for c in pool:
        if c.goods.id in bag.ids:
            used_by_group[c.density_group] += Decimal(
                c.goods.volume_m3
            )

    for group in ("dense", "medium", "light"):
        for c in pool:
            if c.goods.id in bag.ids:
                continue
            if c.density_group != group:
                continue
            if (
                used_by_group[group]
                + Decimal(c.goods.volume_m3)
                > quotas[group]
            ):
                continue
            if bag.fits(c, truck_vol, truck_wt):
                c.reason = "quota"
                bag.add(c)
                used_by_group[group] += Decimal(c.goods.volume_m3)

    for c in pool:
        if c.goods.id in bag.ids:
            continue
        if bag.fits(c, truck_vol, truck_wt):
            c.reason = "topup"
            bag.add(c)

    selected = [c for c in candidates if c.goods.id in bag.ids]
    selected.sort(key=lambda c: c.goods.received_at)

    leftover: list[Candidate] = []
    for c in candidates:
        if c.goods.id in bag.ids:
            continue
        if c.goods.id in excluded:
            c.reason = "excluded"
        else:
            c.reason = "topup"
        leftover.append(c)

    groups_stats = _group_stats(
        selected, truck_vol,
        quota_dense, quota_medium, quota_light,
    )
    fill_pct = _fill_pct(bag, truck_vol, truck_wt)

    return PlanResult(
        warehouse=warehouse,
        truck_volume=truck_vol,
        truck_weight=truck_wt,
        target_cost_usd=target_cost,
        fill_target_pct=fill_target,
        burning_days=burning_days,
        total_volume=bag.volume.quantize(
            VOLUME, rounding=ROUND_HALF_UP
        ),
        total_weight=bag.weight.quantize(
            WEIGHT, rounding=ROUND_HALF_UP
        ),
        total_cost=bag.cost.quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        fill_pct=fill_pct,
        selected=selected,
        left_behind=leftover,
        groups=groups_stats,
    )


def _group_stats(
    selected: list[Candidate],
    truck_vol: Decimal,
    quota_dense: int,
    quota_medium: int,
    quota_light: int,
) -> dict[Group, GroupStats]:
    quotas_pct: dict[Group, int] = {
        "dense": quota_dense,
        "medium": quota_medium,
        "light": quota_light,
    }
    out: dict[Group, GroupStats] = {}
    for group in ("dense", "medium", "light"):
        rows = [c for c in selected if c.density_group == group]
        vol = sum(
            (Decimal(c.goods.volume_m3) for c in rows),
            start=Decimal("0"),
        )
        wt = sum(
            (Decimal(c.goods.weight_kg) for c in rows),
            start=Decimal("0"),
        )
        pct = quotas_pct[group]
        out[group] = GroupStats(
            volume=vol.quantize(VOLUME, rounding=ROUND_HALF_UP),
            weight=wt.quantize(WEIGHT, rounding=ROUND_HALF_UP),
            quota=(truck_vol * Decimal(pct) / 100).quantize(
                VOLUME, rounding=ROUND_HALF_UP
            ),
            quota_pct=pct,
            count=len(rows),
        )
    return out


def make_shipment_number(
    warehouse_code: str, now: datetime, seq_today: int
) -> str:
    prefix = {
        "kashgar": "KAS",
        "urumqi": "URU",
        "yiwu": "YIW",
    }.get(warehouse_code, warehouse_code[:3].upper())
    return (
        f"{prefix}-{now.strftime('%y%m%d')}-"
        f"{seq_today:02d}"
    )
