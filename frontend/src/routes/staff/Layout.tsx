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
    to: '/staff/calc',
    label: 'Калькулятор',
    roles: ['china_staff', 'dushanbe_staff', 'owner'],
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
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-2
          flex flex-wrap items-center justify-between gap-y-2
          gap-x-4 min-h-14">
          <Link to="/staff" className="flex items-center gap-2
            no-underline">
            <span className="font-serif text-xl font-semibold
              text-ink-primary">
              Loik
            </span>
            <span className="label-caps hidden xs:inline">
              {ROLE_LABEL[me.role] ?? me.role}
            </span>
          </Link>
          <div className="flex items-center gap-4 sm:gap-6
            flex-wrap justify-end">
            {activeWarehouse && (
              <div className="text-right">
                <div className="label-caps">Склад</div>
                <div className="text-sm font-medium">
                  {activeWarehouse.name}
                </div>
              </div>
            )}
            <div className="text-right hidden sm:block">
              <div className="text-sm truncate max-w-[16ch]">
                {me.full_name}
              </div>
              <div className="text-xs text-ink-muted truncate
                max-w-[22ch]">
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
        <nav className="mx-auto max-w-6xl px-4 sm:px-6
          flex gap-4 sm:gap-6 border-t border-line-hair
          overflow-x-auto whitespace-nowrap
          [-ms-overflow-style:none] [scrollbar-width:none]
          [&::-webkit-scrollbar]:hidden">
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
                'py-3 text-sm no-underline shrink-0',
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
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6
        sm:py-8">
        {children}
      </main>
    </div>
  )
}
