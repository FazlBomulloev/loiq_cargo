import { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { clearAuth } from '@/lib/api'
import { StaffMe, Warehouse } from '@/lib/types'
import { cx } from '@/ui/utils'

interface Props {
  me: StaffMe
  activeWarehouse: Warehouse | null
  children: ReactNode
}

const ROLE_LABEL: Record<string, string> = {
  china_staff: 'Склад Китая',
  dushanbe_staff: 'Склад Душанбе',
  owner: 'Овнер',
}

interface NavItem {
  to: string
  label: string
  end?: boolean
  roles: readonly ('china_staff' | 'dushanbe_staff' | 'owner')[]
}

const NAV: readonly NavItem[] = [
  {
    to: '/staff/dashboard',
    label: 'Дашборд',
    roles: ['owner'],
  },
  {
    to: '/staff/goods',
    label: 'Товары',
    roles: ['china_staff', 'owner'],
  },
  {
    to: '/staff/receive',
    label: 'Приёмка',
    roles: ['china_staff', 'owner'],
  },
  {
    to: '/staff/dispatch',
    label: 'Отправка',
    roles: ['china_staff', 'owner'],
  },
  {
    to: '/staff/shipments',
    label: 'Партии',
    roles: ['china_staff', 'dushanbe_staff', 'owner'],
  },
  {
    to: '/staff/waybills',
    label: 'Накладные',
    roles: ['dushanbe_staff', 'owner'],
  },
  {
    to: '/staff/delivery',
    label: 'Выдача',
    roles: ['dushanbe_staff', 'owner'],
  },
  {
    to: '/staff/delivery-history',
    label: 'История выдач',
    roles: ['dushanbe_staff', 'owner'],
  },
  {
    to: '/staff/debts',
    label: 'Долги',
    roles: ['dushanbe_staff', 'owner'],
  },
  {
    to: '/staff/unclaimed',
    label: 'Без клиента',
    roles: ['owner'],
  },
  {
    to: '/staff/tariffs',
    label: 'Тарифы',
    roles: ['owner'],
  },
  {
    to: '/staff/requests',
    label: 'Заявки',
    roles: ['china_staff', 'dushanbe_staff', 'owner'],
  },
  {
    to: '/staff/clients',
    label: 'Клиенты',
    roles: ['owner'],
  },
  {
    to: '/staff/team',
    label: 'Сотрудники',
    roles: ['owner'],
  },
  {
    to: '/staff/settings',
    label: 'Настройки',
    roles: ['owner'],
  },
]

export function StaffLayout({
  me, activeWarehouse, children,
}: Props) {
  const nav = useNavigate()
  function logout() {
    clearAuth()
    nav('/staff/login', { replace: true })
  }
  return (
    <div className="min-h-screen bg-app text-ink-primary">
      <header className="border-b border-line bg-elev">
        <div className="mx-auto max-w-6xl px-6 h-14
          flex items-center justify-between">
          <Link to="/staff" className="flex items-center gap-2
            no-underline">
            <span className="font-serif text-xl font-semibold
              text-ink-primary">
              Loik
            </span>
            <span className="label-caps">
              {ROLE_LABEL[me.role] ?? me.role}
            </span>
          </Link>
          <div className="flex items-center gap-6">
            {activeWarehouse && (
              <div className="text-right">
                <div className="label-caps">Склад</div>
                <div className="text-sm font-medium">
                  {activeWarehouse.name}
                </div>
              </div>
            )}
            <div className="text-right">
              <div className="text-sm">{me.full_name}</div>
              <div className="text-xs text-ink-muted">
                {me.email}
              </div>
            </div>
            <button
              onClick={logout}
              className="text-sm text-ink-secondary
                hover:text-accent"
            >
              Выход
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-6 flex gap-6
          border-t border-line-hair">
          {NAV.filter((n) =>
            n.roles.includes(
              me.role as 'china_staff' | 'dushanbe_staff' | 'owner'
            )
          ).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx(
                'py-3 text-sm no-underline',
                'border-b-2 -mb-px',
                isActive
                  ? 'border-accent text-ink-primary ' +
                      'font-medium'
                  : 'border-transparent text-ink-secondary ' +
                      'hover:text-accent',
              )}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
