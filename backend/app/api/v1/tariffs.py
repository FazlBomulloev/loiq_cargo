import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Principal, require_staff
from app.core.db import get_session
from app.models import Tariff, TariffRow, UserRole, Warehouse
from app.schemas.tariff import (
    TariffActivateRequest,
    TariffFull,
    TariffIn,
    TariffRowFull,
)

log = logging.getLogger(__name__)

router = APIRouter(tags=["tariffs"])


def _to_full(tariff: Tariff, warehouse: Warehouse) -> TariffFull:
    return TariffFull(
        id=tariff.id,
        warehouse_id=tariff.warehouse_id,
        warehouse_name=warehouse.name,
        currency=tariff.currency,
        is_active=tariff.is_active,
        effective_from=tariff.effective_from,
        note=tariff.note,
        created_at=tariff.created_at,
        rows=[
            TariffRowFull(
                id=r.id,
                density_from=r.density_from,
                density_to=r.density_to,
                rate_usd_per_kg=r.rate_usd_per_kg,
            )
            for r in tariff.rows
        ],
    )


def _validate_rows(rows: list) -> None:
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="сетка должна содержать хотя бы одну строку",
        )
    ordered = sorted(rows, key=lambda r: r.density_from)
    for r in ordered:
        if r.density_to is not None and r.density_to <= r.density_from:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "верхняя граница плотности должна быть больше "
                    "нижней"
                ),
            )
    for a, b in zip(ordered, ordered[1:]):
        if a.density_to is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "открытый диапазон допустим только у верхней "
                    "строки сетки"
                ),
            )
        if a.density_to != b.density_from:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "диапазоны плотности должны быть непрерывны: "
                    f"{a.density_to} ≠ {b.density_from}"
                ),
            )


async def _warehouse_or_404(
    session: AsyncSession, warehouse_id: int
) -> Warehouse:
    wh = (
        await session.execute(
            select(Warehouse).where(Warehouse.id == warehouse_id)
        )
    ).scalar_one_or_none()
    if wh is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="склад не найден",
        )
    return wh


@router.get(
    "/warehouses/{warehouse_id}/tariffs",
    response_model=list[TariffFull],
    summary="Все версии тарифа склада",
)
async def list_tariffs(
    warehouse_id: int,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> list[TariffFull]:
    wh = await _warehouse_or_404(session, warehouse_id)
    stmt = (
        select(Tariff)
        .where(Tariff.warehouse_id == warehouse_id)
        .options(selectinload(Tariff.rows))
        .order_by(Tariff.effective_from.desc(), Tariff.id.desc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [_to_full(t, wh) for t in rows]


@router.post(
    "/warehouses/{warehouse_id}/tariffs",
    response_model=TariffFull,
    status_code=status.HTTP_201_CREATED,
    summary="Создать новую версию тарифа (черновик, не активна)",
)
async def create_tariff(
    warehouse_id: int,
    body: TariffIn,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> TariffFull:
    wh = await _warehouse_or_404(session, warehouse_id)
    _validate_rows(body.rows)

    tariff = Tariff(
        warehouse_id=wh.id,
        effective_from=datetime.now(timezone.utc),
        is_active=False,
        currency="USD",
        note=body.note,
    )
    session.add(tariff)
    await session.flush()

    for row in body.rows:
        session.add(
            TariffRow(
                tariff_id=tariff.id,
                density_from=row.density_from,
                density_to=row.density_to,
                rate_usd_per_kg=row.rate_usd_per_kg,
            )
        )
    await session.commit()

    stmt = (
        select(Tariff)
        .where(Tariff.id == tariff.id)
        .options(selectinload(Tariff.rows))
    )
    fresh = (await session.execute(stmt)).scalar_one()
    log.info(
        "тариф создан: id=%s склад=%s строк=%s",
        fresh.id, wh.code.value, len(body.rows),
    )
    return _to_full(fresh, wh)


@router.put(
    "/tariffs/{tariff_id}",
    response_model=TariffFull,
    summary="Изменить черновик тарифа (строки/комментарий)",
)
async def update_tariff(
    tariff_id: int,
    body: TariffIn,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> TariffFull:
    stmt = (
        select(Tariff)
        .where(Tariff.id == tariff_id)
        .options(
            selectinload(Tariff.rows),
            selectinload(Tariff.warehouse),
        )
    )
    tariff = (await session.execute(stmt)).scalar_one_or_none()
    if tariff is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="тариф не найден",
        )
    if tariff.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "активный тариф нельзя редактировать: "
                "создайте новую версию и активируйте её"
            ),
        )
    _validate_rows(body.rows)
    tariff.note = body.note
    for r in list(tariff.rows):
        await session.delete(r)
    await session.flush()
    for row in body.rows:
        session.add(
            TariffRow(
                tariff_id=tariff.id,
                density_from=row.density_from,
                density_to=row.density_to,
                rate_usd_per_kg=row.rate_usd_per_kg,
            )
        )
    await session.commit()

    fresh = (
        await session.execute(stmt)
    ).scalar_one()
    return _to_full(fresh, tariff.warehouse)


@router.post(
    "/tariffs/{tariff_id}/activate",
    response_model=TariffFull,
    summary="Активировать тариф (деактивирует предыдущий)",
)
async def activate_tariff(
    tariff_id: int,
    body: TariffActivateRequest,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> TariffFull:
    stmt = (
        select(Tariff)
        .where(Tariff.id == tariff_id)
        .options(
            selectinload(Tariff.rows),
            selectinload(Tariff.warehouse),
        )
    )
    tariff = (await session.execute(stmt)).scalar_one_or_none()
    if tariff is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="тариф не найден",
        )
    if not tariff.rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="в тарифе нет строк",
        )

    await session.execute(
        update(Tariff)
        .where(
            Tariff.warehouse_id == tariff.warehouse_id,
            Tariff.id != tariff.id,
        )
        .values(is_active=False)
    )
    tariff.is_active = True
    tariff.effective_from = (
        body.effective_from or datetime.now(timezone.utc)
    )
    await session.commit()

    fresh = (
        await session.execute(stmt)
    ).scalar_one()
    log.info(
        "тариф активирован: id=%s склад=%s",
        fresh.id, tariff.warehouse.code.value,
    )
    return _to_full(fresh, tariff.warehouse)


@router.delete(
    "/tariffs/{tariff_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить черновик тарифа (нельзя удалить активный)",
)
async def delete_tariff(
    tariff_id: int,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> None:
    tariff = (
        await session.execute(
            select(Tariff).where(Tariff.id == tariff_id)
        )
    ).scalar_one_or_none()
    if tariff is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="тариф не найден",
        )
    if tariff.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "нельзя удалить активный тариф — сначала "
                "активируйте другой"
            ),
        )
    await session.delete(tariff)
    await session.commit()
    log.info("тариф удалён: id=%s", tariff_id)
