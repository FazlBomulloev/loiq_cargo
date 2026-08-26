import { ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, clearAuth, getKind, getToken } from '@/lib/api'
import { Me, StaffMe, Warehouse } from '@/lib/types'

type StaffRole =
  | 'china_staff' | 'dushanbe_staff' | 'owner'

interface Ctx {
  me: StaffMe
  warehouses: Warehouse[]
  activeWarehouse: Warehouse | null
}

interface Props {
  roles?: StaffRole[]
  children: (ctx: Ctx) => ReactNode
}

export function RequireStaff({ roles, children }: Props) {
  const [me, setMe] = useState<StaffMe | null>(null)
  const [wh, setWh] = useState<Warehouse[]>([])
  const [state, setState] = useState<
    'load' | 'ok' | 'kick' | 'forbid'
  >('load')

  useEffect(() => {
    const token = getToken()
    if (!token || getKind() !== 'staff') {
      setState('kick')
      return
    }
    Promise.all([
      api<Me>('/auth/me'),
      api<Warehouse[]>('/warehouses', { auth: false }),
    ])
      .then(([m, ws]) => {
        if (m.kind !== 'staff') {
          setState('kick')
          return
        }
        if (roles && !roles.includes(m.role as StaffRole)) {
          setState('forbid')
          return
        }
        setMe(m)
        setWh(ws)
        setState('ok')
      })
      .catch(() => {
        clearAuth()
        setState('kick')
      })
  }, [])

  if (state === 'load') {
    return (
      <div className="min-h-screen grid place-items-center
        text-ink-muted text-sm">
        Загружаем…
      </div>
    )
  }
  if (state === 'kick' || !me) {
    return <Navigate to="/staff/login" replace />
  }
  if (state === 'forbid') {
    return (
      <div className="min-h-screen grid place-items-center
        text-sm">
        <div className="text-center">
          <div className="font-serif text-2xl mb-2">
            Нет доступа
          </div>
          <div className="text-ink-muted">
            У вашей роли нет прав на этот раздел.
          </div>
        </div>
      </div>
    )
  }

  const active =
    wh.find((w) => w.id === me.warehouse_id) ?? null
  return <>{children({ me, warehouses: wh, activeWarehouse: active })}</>
}
