import { Link, useLocation } from 'react-router-dom'
import { ReactNode } from 'react'
import { getKind, getToken } from '@/lib/api'
import { cx } from './utils'

interface Props {
  children: ReactNode
  narrow?: boolean
}

export function PublicShell({ children, narrow = true }: Props) {
  const loc = useLocation()
  const onLogin = loc.pathname === '/login'
  const onStaffLogin = loc.pathname === '/staff/login'
  const onRegister = loc.pathname.startsWith('/register')

  const hasToken = !!getToken()
  const kind = getKind()
  const cabinetHref =
    hasToken && kind === 'staff' ? '/staff' :
      hasToken && kind === 'client' ? '/app' : null

  return (
    <div className="min-h-screen bg-app text-ink-primary">
      <header className="border-b border-line bg-elev">
        <div className={cx(
          'mx-auto flex flex-wrap items-center justify-between',
          'px-4 sm:px-6 gap-y-2 gap-x-4 py-2 min-h-14',
          narrow ? 'max-w-3xl' : 'max-w-6xl',
        )}>
          <Link
            to={cabinetHref ?? '/'}
            className="flex items-center gap-2 no-underline"
          >
            <span className="font-serif text-xl font-semibold
              text-ink-primary">
              Loik
            </span>
            <span className="label-caps hidden xs:inline">
              Cargo
            </span>
          </Link>
          <nav className="flex items-center flex-wrap
            gap-x-3 gap-y-2 sm:gap-4 text-sm justify-end">
            <Link
              to="/"
              className="text-ink-secondary hover:text-accent"
            >
              Калькулятор
            </Link>
            {cabinetHref ? (
              <Link
                to={cabinetHref}
                className="text-ink-secondary hover:text-accent"
              >
                В кабинет
              </Link>
            ) : (
              <>
                {!onLogin && !onStaffLogin && (
                  <Link
                    to="/login"
                    className="text-ink-secondary
                      hover:text-accent"
                  >
                    Войти
                  </Link>
                )}
                {!onStaffLogin && !onLogin && (
                  <Link
                    to="/staff/login"
                    className="text-ink-secondary
                      hover:text-accent"
                  >
                    Сотрудникам
                  </Link>
                )}
                {!onStaffLogin && !onRegister && (
                  <Link
                    to="/register"
                    className="rounded-md bg-accent px-3 py-1.5
                      text-card text-sm font-medium
                      hover:bg-accent-strong no-underline"
                  >
                    Стать клиентом
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
      </header>
      <main className={cx(
        'mx-auto px-4 sm:px-6 py-6 sm:py-10',
        narrow ? 'max-w-3xl' : 'max-w-6xl',
      )}>
        {children}
      </main>
    </div>
  )
}
