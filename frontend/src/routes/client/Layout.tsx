import { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pill } from '@/ui/Pill'
import { clearAuth } from '@/lib/api'
import { ClientMe } from '@/lib/types'

interface Props {
  me: ClientMe
  children: ReactNode
}

export function ClientLayout({ me, children }: Props) {
  const nav = useNavigate()

  function logout() {
    clearAuth()
    nav('/login', { replace: true })
  }

  const tgVariant =
    me.telegram_status === 'verified' ? 'ok' :
      me.telegram_status === 'pending' ? 'route' : 'warn'
  const tgText =
    me.telegram_status === 'verified' ? 'Telegram привязан' :
      me.telegram_status === 'pending' ? 'Ожидаем Telegram' :
        'Telegram не привязан'

  return (
    <div className="min-h-screen bg-app text-ink-primary">
      <header className="border-b border-line bg-elev">
        <div className="mx-auto flex items-center
          justify-between px-6 h-14 max-w-6xl">
          <div className="flex items-center gap-3">
            <Link to="/app" className="flex items-center gap-2
              no-underline">
              <span className="font-serif text-xl
                font-semibold text-ink-primary">
                Loik
              </span>
              <span className="label-caps">Кабинет</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Pill variant={tgVariant}>{tgText}</Pill>
            <div className="text-right">
              <div className="font-mono-nums text-sm
                text-accent-strong">
                {me.client_code}
              </div>
              <div className="text-xs text-ink-muted">
                {me.full_name}
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
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
