import { ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import Calculator from '@/routes/Calculator'
import Login from '@/routes/Login'
import Register from '@/routes/Register'
import TgVerify from '@/routes/TgVerify'
import { RequireClient } from '@/routes/client/guard'
import { ClientLayout } from '@/routes/client/Layout'
import { ClientDashboard } from '@/routes/client/Dashboard'
import StaffLogin from '@/routes/staff/Login'
import { RequireStaff } from '@/routes/staff/guard'
import { StaffLayout } from '@/routes/staff/Layout'
import { StaffGoods } from '@/routes/staff/Goods'
import { StaffReceive } from '@/routes/staff/Receive'
import { StaffRequests } from '@/routes/staff/Requests'
import { StaffDispatch } from '@/routes/staff/Dispatch'
import { StaffShipments } from '@/routes/staff/Shipments'
import { StaffWaybills } from '@/routes/staff/Waybills'
import { StaffWaybillDetail } from '@/routes/staff/WaybillDetail'
import { StaffDelivery } from '@/routes/staff/Delivery'
import { StaffDeliveryHistory } from '@/routes/staff/DeliveryHistory'
import { StaffCalc } from '@/routes/staff/Calc'
import { StaffTariffs } from '@/routes/staff/Tariffs'
import { StaffDebts } from '@/routes/staff/Debts'
import { StaffUnclaimed } from '@/routes/staff/Unclaimed'
import { StaffDashboard } from '@/routes/staff/Dashboard'
import { StaffSettings } from '@/routes/staff/Settings'
import { StaffAdmin } from '@/routes/staff/StaffAdmin'
import { ClientsAdmin } from '@/routes/staff/ClientsAdmin'

function staffPage(node: (ctx: {
  me: import('@/lib/types').StaffMe
  warehouses: import('@/lib/types').Warehouse[]
  activeWarehouse: import('@/lib/types').Warehouse | null
}) => ReactNode) {
  return (
    <RequireStaff>
      {(ctx) => (
        <StaffLayout
          me={ctx.me}
          activeWarehouse={ctx.activeWarehouse}
        >
          {node(ctx)}
        </StaffLayout>
      )}
    </RequireStaff>
  )
}

export const router = createBrowserRouter([
  { path: '/', element: <Calculator /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/register/verify', element: <TgVerify /> },
  {
    path: '/app',
    element: (
      <RequireClient>
        {(me) => (
          <ClientLayout me={me}>
            <ClientDashboard me={me} />
          </ClientLayout>
        )}
      </RequireClient>
    ),
  },
  { path: '/staff/login', element: <StaffLogin /> },
  {
    path: '/staff',
    element: staffPage((c) => (
      <Navigate
        to={
          c.me.role === 'dushanbe_staff'
            ? '/staff/waybills'
            : c.me.role === 'owner'
              ? '/staff/dashboard'
              : '/staff/goods'
        }
        replace
      />
    )),
  },
  {
    path: '/staff/dashboard',
    element: staffPage((c) => <StaffDashboard me={c.me} />),
  },
  {
    path: '/staff/calc',
    element: staffPage((c) => (
      <StaffCalc
        warehouses={c.warehouses}
        activeWarehouse={c.activeWarehouse}
      />
    )),
  },
  {
    path: '/staff/goods',
    element: staffPage((c) => (
      <StaffGoods
        me={c.me}
        activeWarehouse={c.activeWarehouse}
        warehouses={c.warehouses}
      />
    )),
  },
  {
    path: '/staff/receive',
    element: staffPage((c) => (
      <StaffReceive
        me={c.me}
        activeWarehouse={c.activeWarehouse}
        warehouses={c.warehouses}
      />
    )),
  },
  {
    path: '/staff/dispatch',
    element: staffPage((c) => (
      <StaffDispatch
        me={c.me}
        activeWarehouse={c.activeWarehouse}
        warehouses={c.warehouses}
      />
    )),
  },
  {
    path: '/staff/shipments',
    element: staffPage((c) => (
      <StaffShipments
        me={c.me}
        activeWarehouse={c.activeWarehouse}
        warehouses={c.warehouses}
      />
    )),
  },
  {
    path: '/staff/waybills',
    element: staffPage(() => <StaffWaybills />),
  },
  {
    path: '/staff/waybills/:id',
    element: staffPage(() => <StaffWaybillDetail />),
  },
  {
    path: '/staff/delivery',
    element: staffPage(() => <StaffDelivery />),
  },
  {
    path: '/staff/delivery-history',
    element: staffPage(() => <StaffDeliveryHistory />),
  },
  {
    path: '/staff/debts',
    element: staffPage(() => <StaffDebts />),
  },
  {
    path: '/staff/tariffs',
    element: staffPage((c) => (
      <StaffTariffs me={c.me} warehouses={c.warehouses} />
    )),
  },
  {
    path: '/staff/unclaimed',
    element: staffPage((c) => (
      <StaffUnclaimed me={c.me} warehouses={c.warehouses} />
    )),
  },
  {
    path: '/staff/requests',
    element: staffPage((c) => <StaffRequests me={c.me} />),
  },
  {
    path: '/staff/clients',
    element: staffPage((c) => <ClientsAdmin me={c.me} />),
  },
  {
    path: '/staff/team',
    element: staffPage((c) => (
      <StaffAdmin me={c.me} warehouses={c.warehouses} />
    )),
  },
  {
    path: '/staff/settings',
    element: staffPage((c) => (
      <StaffSettings me={c.me} warehouses={c.warehouses} />
    )),
  },
  { path: '*', element: <Calculator /> },
])
