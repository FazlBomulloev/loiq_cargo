import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicShell } from '@/ui/PublicShell'
import { Card } from '@/ui/Card'
import { Pill } from '@/ui/Pill'
import { api, clearAuth, getToken } from '@/lib/api'
import {
  ClientRegisterResponse,
  VerifyCodeResponse,
} from '@/lib/types'

const QR_SRC = (url: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?` +
  `size=200x200&margin=0&data=${encodeURIComponent(url)}`

export default function TgVerify() {
  const [payload, setPayload] = useState<
    ClientRegisterResponse | null
  >(null)
  const [status, setStatus] = useState<
    'not_started' | 'pending' | 'verified'
  >('pending')
  const [showQr, setShowQr] = useState(false)
  const timerRef = useRef<number | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    const raw = sessionStorage.getItem('loik.register')
    if (!raw || !getToken()) {
      nav('/register', { replace: true })
      return
    }
    setPayload(JSON.parse(raw))
  }, [nav])

  useEffect(() => {
    if (!payload) return
    let cancelled = false

    async function tick() {
      try {
        const r = await api<VerifyCodeResponse>(
          '/clients/me/verify-code'
        )
        if (cancelled) return
        setStatus(r.telegram_status)
        if (r.telegram_status === 'verified') {
          sessionStorage.removeItem('loik.register')
          nav('/app', { replace: true })
          return
        }
      } catch {
        // тихо игнорируем — попробуем на следующем тике
      }
      if (!cancelled) {
        timerRef.current = window.setTimeout(tick, 2500)
      }
    }
    tick()
    return () => {
      cancelled = true
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [payload, nav])

  function cancel() {
    clearAuth()
    sessionStorage.removeItem('loik.register')
    nav('/login', { replace: true })
  }

  if (!payload) return null

  const pillVariant =
    status === 'verified' ? 'ok' :
      status === 'pending' ? 'route' : 'warn'
  const pillText =
    status === 'verified' ? 'Telegram привязан' :
      'Ожидаем подтверждение'

  return (
    <PublicShell narrow>
      <div className="mx-auto max-w-xl">
        <h1 className="font-serif text-3xl font-semibold mb-2">
          Ваш код клиента
        </h1>
        <p className="text-ink-secondary mb-6">
          Сохраните его — по нему вы входите в кабинет и
          отдаёте груз на склад.
        </p>

        <Card>
          <div className="flex items-center justify-between
            mb-6 gap-4">
            <div>
              <div className="label-caps">Код клиента</div>
              <div className="font-mono-nums text-3xl
                text-accent-strong mt-1">
                {payload.client_code}
              </div>
            </div>
            <Pill variant={pillVariant}>{pillText}</Pill>
          </div>

          <div className="rounded-md border border-line
            bg-elev p-5 mb-6">
            <div className="label-caps mb-2">
              Привяжите Telegram — и мы сами вас войдём
            </div>
            <p className="text-sm text-ink-secondary mb-4">
              Нажмите кнопку — откроется Telegram, привязка
              произойдёт автоматически. Вводить{' '}
              <span className="font-mono-nums">/verify</span>{' '}
              руками не нужно.
            </p>
            <a
              href={payload.telegram_deep_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center
                w-full rounded-md bg-accent px-4 py-3
                text-card font-medium text-base
                hover:bg-accent-strong no-underline"
            >
              Открыть Telegram и подтвердить
            </a>
            <div className="mt-4 flex items-center justify-between
              text-xs text-ink-muted">
              <span>
                {status === 'verified'
                  ? 'Готово, входим…'
                  : 'Ждём подтверждение, страница закроется сама'}
              </span>
              <button
                type="button"
                onClick={() => setShowQr((v) => !v)}
                className="text-ink-secondary hover:text-accent"
              >
                {showQr ? 'Скрыть QR' : 'Открыть с телефона (QR)'}
              </button>
            </div>
          </div>

          {showQr && (
            <div className="rounded-md border border-line
              bg-card p-5 mb-6 flex gap-4 items-start">
              <img
                src={QR_SRC(payload.telegram_deep_link)}
                alt="QR"
                className="rounded-md border border-line
                  bg-white p-2 shrink-0"
                width={200}
                height={200}
              />
              <div className="text-sm text-ink-secondary">
                <div className="mb-1 text-ink-primary
                  font-medium">
                  Не работает кнопка?
                </div>
                Отсканируйте QR с телефона — Telegram привяжет
                аккаунт автоматически. Если и так не открылось,
                можно вручную:{' '}
                <span className="font-mono-nums
                  text-ink-primary">
                  /verify {payload.telegram_verification_code}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center
            border-t border-line-hair pt-6">
            <button
              onClick={cancel}
              className="text-sm text-ink-secondary
                hover:text-accent"
            >
              Отмена
            </button>
            <Link
              to="/app"
              onClick={() => sessionStorage.removeItem(
                'loik.register'
              )}
              className="text-sm text-accent"
            >
              Пропустить и войти позже →
            </Link>
          </div>
        </Card>
      </div>
    </PublicShell>
  )
}
