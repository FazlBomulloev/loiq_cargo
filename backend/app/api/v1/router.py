from fastapi import APIRouter

from app.api.v1 import (
    analytics,
    auth,
    calc,
    change_requests,
    clients,
    clients_admin,
    dushanbe,
    payments,
    settings as settings_api,
    shipments,
    staff,
    tariffs,
    unclaimed,
    warehouse_goods,
    warehouses,
)

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth.router)
api_v1.include_router(calc.router)
api_v1.include_router(warehouses.router)
api_v1.include_router(warehouse_goods.router)
api_v1.include_router(shipments.router)
api_v1.include_router(dushanbe.router)
api_v1.include_router(tariffs.router)
api_v1.include_router(payments.router)
api_v1.include_router(clients.router)
api_v1.include_router(clients_admin.router)
api_v1.include_router(unclaimed.router)
api_v1.include_router(analytics.router)
api_v1.include_router(settings_api.router)
api_v1.include_router(staff.router)
api_v1.include_router(change_requests.router)
