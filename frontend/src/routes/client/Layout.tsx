import { ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pill } from '@/ui/Pill'
import { api, clearAuth } from '@/lib/api'
import { ClientMe, VerifyCodeResponse } from '@/lib/types'
import { useToast } from '@/ui/Toast'

interface Props {
  me: ClientMe
  children: ReactNode
}

export function ClientLayout({ me, children }: Props) {
  const nav = useNavigate()
  const toast = useToast()
  const [loadingTg, setLoadingTg] = useState(false)

  function logout() {
    clearAuth()
    nav('/login', { replace: true })
  }

  async function openTgLink() {
    if (me.telegram_status === 'verified') return
    setLoadingTg(true)
    try {
      const r = await api<VerifyCodeResponse>(
        '/clients/me/verify-code'
      )
      window.open(r.telegram_deep_link, '_blank', 'noopener')
      toast.push({
        kind: 'info',
        text: 'Откройте Telegram и подтвердите привязку — ' +
          'страница обновит статус автоматически.',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setLoadingTg(false)
    }
  }

  const tgVariant =
    me.telegram_status === 'verified' ? 'ok' :
      me.telegram_status === 'pending' ? 'route' : 'warn'
  const tgText =
    me.telegram_status === 'verified' ? 'Telegram привязан' :
      me.telegram_status === 'pending' ? 'Ожидаем Telegram' :
        'Telegram не привязан'
  const tgIsBindable = me.telegram_status !== 'verified'

  return (
    <div className="min-h-screen bg-app text-ink-primary">
      <header className="border-b border-line bg-elev">
        <div className="mx-auto flex flex-wrap items-center
          justify-between px-4 sm:px-6 py-2 gap-y-2 gap-x-4
          min-h-14 max-w-6xl">
          <div className="flex items-center gap-3">
            <Link to="/app" className="flex items-center gap-2
              no-underline">
              <span className="font-serif text-xl
                font-semibold text-ink-primary">
                Loik
              </span>
              <span className="label-caps hidden xs:inline">
                Кабинет
              </span>
            </Link>
          </div>
          <div className="flex items-center flex-wrap justify-end
            gap-x-3 gap-y-2 sm:gap-4">
            {tgIsBindable ? (
              <button
                type="button"
                onClick={openTgLink}
                disabled={loadingTg}
                className="cursor-pointer disabled:opacity-60"
                title="Открыть Telegram и подтвердить"
              >
                <Pill variant={tgVariant}>
                  {tgText} — привязать
                </Pill>
              </button>
            ) : (
              <Pill variant={tgVariant}>{tgText}</Pill>
            )}
            <div className="text-right">
              <div className="font-mono-nums text-sm
                text-accent-strong">
                {me.client_code}
              </div>
              <div className="text-xs text-ink-muted truncate
                max-w-[22ch]">
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
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}
