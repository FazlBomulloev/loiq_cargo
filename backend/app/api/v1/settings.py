import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, require_staff
from app.core.db import get_session
from app.models import Setting, UserRole, Warehouse
from app.schemas.settings import (
    SettingItem,
    SettingsResponse,
    SettingsUpdateRequest,
    WarehouseUpdateRequest,
)
from app.schemas.warehouse import WarehouseOut
from app.services.settings_service import DEFAULTS

log = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


_KIND: dict[str, str] = {
    "burning_days_threshold": "int",
    "fill_target_pct": "int",
    "target_cost_usd": "int",
    "density_quota_dense_pct": "int",
    "density_quota_medium_pct": "int",
    "density_quota_light_pct": "int",
    "free_storage_days": "int",
    "storage_daily_coef_somoni": "float",
    "exchange_rate_somoni_per_usd": "float",
}

_DESCRIPTIONS: dict[str, str] = {
    "burning_days_threshold":
        "N дней до пометки товара «горящим»",
    "fill_target_pct":
        "порог заполненности фуры (объём ИЛИ вес), %",
    "target_cost_usd":
        "целевая стоимость полной фуры, $",
    "density_quota_dense_pct":
        "квота плотного груза (≥250 кг/м³), % объёма",
    "density_quota_medium_pct":
        "квота среднего груза (100–249), % объёма",
    "density_quota_light_pct":
        "квота лёгкого груза (<100), % объёма",
    "free_storage_days":
        "дней бесплатного хранения в Душанбе",
    "storage_daily_coef_somoni":
        "стоимость дня простоя, сомони",
    "exchange_rate_somoni_per_usd":
        "курс: 1 USD = X сомони",
}


def _coerce(key: str, raw: Any) -> Any:
    kind = _KIND.get(key, "float")
    try:
        if kind == "int":
            v = int(raw)
        else:
            v = float(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{key}: некорректное число",
        ) from exc
    if kind == "int" and v < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{key} должен быть ≥ 0",
        )
    if kind == "float" and v <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{key} должен быть > 0",
        )
    return v


@router.get(
    "",
    response_model=SettingsResponse,
    summary="Все настройки (для формы овнера)",
)
async def get_all(
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> SettingsResponse:
    rows = (await session.execute(select(Setting))).scalars().all()
    stored = {r.key: r for r in rows}
    items: list[SettingItem] = []
    for key, default in DEFAULTS.items():
        row = stored.get(key)
        items.append(
            SettingItem(
                key=key,
                value=(row.value if row else default),
                description=(
                    (row.description if row else None)
                    or _DESCRIPTIONS.get(key)
                ),
                default=default,
                kind=_KIND.get(key, "float"),
            )
        )
    return SettingsResponse(items=items)


@router.patch(
    "",
    response_model=SettingsResponse,
    summary="Изменить несколько ключей настроек",
)
async def update_settings(
    body: SettingsUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> SettingsResponse:
    unknown = set(body.values.keys()) - set(DEFAULTS.keys())
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "неизвестные настройки: "
                + ", ".join(sorted(unknown))
            ),
        )

    quotas = {
        "density_quota_dense_pct",
        "density_quota_medium_pct",
        "density_quota_light_pct",
    }

    rows = (
        await session.execute(
            select(Setting).where(
                Setting.key.in_(list(DEFAULTS.keys()))
            )
        )
    ).scalars().all()
    existing = {r.key: r for r in rows}

    new_values: dict[str, Any] = {
        k: (
            existing[k].value if k in existing
            else DEFAULTS[k]
        )
        for k in DEFAULTS.keys()
    }
    for key, raw in body.values.items():
        v = _coerce(key, raw)
        new_values[key] = v
        if key in existing:
            existing[key].value = v
        else:
            session.add(
                Setting(
                    key=key,
                    value=v,
                    description=_DESCRIPTIONS.get(key),
                )
            )

    if any(k in body.values for k in quotas):
        total = sum(int(new_values[k]) for k in quotas)
        if total != 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "сумма квот должна быть 100%, "
                    f"сейчас {total}%"
                ),
            )

    await session.commit()
    log.info(
        "настройки обновлены: %s",
        ", ".join(sorted(body.values.keys())),
    )
    return await get_all(session, _principal)


@router.put(
    "/warehouses/{warehouse_id}",
    response_model=WarehouseOut,
    summary="Изменить параметры склада (лимиты фуры, коэф., имя)",
)
async def update_warehouse(
    warehouse_id: int,
    body: WarehouseUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> WarehouseOut:
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
    updated = False
    if body.truck_volume_m3 is not None:
        wh.truck_volume_m3 = body.truck_volume_m3
        updated = True
    if body.truck_weight_kg is not None:
        wh.truck_weight_kg = body.truck_weight_kg
        updated = True
    if body.multiplier is not None:
        wh.multiplier = body.multiplier
        updated = True
    if body.name is not None:
        wh.name = body.name.strip()
        updated = True
    if body.address is not None:
        wh.address = body.address.strip() or None
        updated = True
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="нет полей для обновления",
        )
    await session.commit()
    await session.refresh(wh)
    log.info("склад %s обновлён", wh.code.value)
    return WarehouseOut.model_validate(wh)
