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
          'mx-auto flex items-center justify-between',
          'px-6 h-14',
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
            <span className="label-caps">Cargo</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
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
        'mx-auto px-6 py-10',
        narrow ? 'max-w-3xl' : 'max-w-6xl',
      )}>
        {children}
      </main>
    </div>
  )
}
