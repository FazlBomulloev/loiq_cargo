from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.schemas.calc import CalcRequest, CalcResponse
from app.services import tariff as tariff_svc

router = APIRouter(prefix="/calc", tags=["calc"])


@router.post(
    "/quote",
    response_model=CalcResponse,
    summary="Публичный калькулятор стоимости",
)
async def quote(
    body: CalcRequest,
    session: AsyncSession = Depends(get_session),
) -> CalcResponse:
    try:
        q = await tariff_svc.quote(
            session,
            warehouse_id=body.warehouse_id,
            weight_kg=body.weight_kg,
            volume_m3=body.volume_m3,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return CalcResponse(
        warehouse_id=q.warehouse_id,
        warehouse_name=q.warehouse_name,
        weight_kg=q.weight_kg,
        volume_m3=q.volume_m3,
        density_kg_m3=q.density_kg_m3,
        density_from=q.density_from,
        density_to=q.density_to,
        rate_usd_per_kg=q.rate_usd_per_kg,
        freight_usd=q.freight_usd,
        freight_somoni=q.freight_somoni,
        exchange_rate=q.exchange_rate,
    )
