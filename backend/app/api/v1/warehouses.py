from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models import Warehouse
from app.schemas.warehouse import (
    TariffOut,
    TariffRowOut,
    WarehouseOut,
)
from app.services import tariff as tariff_svc

router = APIRouter(prefix="/warehouses", tags=["warehouses"])


@router.get(
    "",
    response_model=list[WarehouseOut],
    summary="Список складов (публично)",
)
async def list_warehouses(
    session: AsyncSession = Depends(get_session),
) -> list[WarehouseOut]:
    rows = (
        await session.execute(
            select(Warehouse).order_by(Warehouse.name)
        )
    ).scalars().all()
    return [WarehouseOut.model_validate(r) for r in rows]


@router.get(
    "/{warehouse_id}/active-tariff",
    response_model=TariffOut,
    summary="Активный тариф склада (публично)",
)
async def active_tariff(
    warehouse_id: int,
    session: AsyncSession = Depends(get_session),
) -> TariffOut:
    tariff = await tariff_svc.get_active_tariff(
        session, warehouse_id
    )
    if tariff is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="активного тарифа нет",
        )
    return TariffOut(
        id=tariff.id,
        warehouse_id=tariff.warehouse_id,
        currency=tariff.currency,
        effective_from=tariff.effective_from.isoformat(),
        rows=[TariffRowOut.model_validate(r) for r in tariff.rows],
    )


