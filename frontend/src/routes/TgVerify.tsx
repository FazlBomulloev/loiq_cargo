import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicShell } from '@/ui/PublicShell'
import { Card } from '@/ui/Card'
import { Button } from '@/ui/Button'
import { Pill } from '@/ui/Pill'
import { ClientRegisterResponse } from '@/lib/types'

const QR_SRC = (url: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?` +
  `size=220x220&margin=0&data=${encodeURIComponent(url)}`

export default function TgVerify() {
  const [payload, setPayload] = useState<
    ClientRegisterResponse | null
  >(null)
  const nav = useNavigate()

  useEffect(() => {
    const raw = sessionStorage.getItem('loik.register')
    if (!raw) {
      nav('/register', { replace: true })
      return
    }
    setPayload(JSON.parse(raw))
  }, [nav])

  if (!payload) return null

  return (
    <PublicShell narrow>
      <div className="mx-auto max-w-2xl">
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
            <Pill variant="route">Ожидаем Telegram</Pill>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 items-start">
            <div>
              <div className="label-caps mb-3">QR для Telegram</div>
              <img
                src={QR_SRC(payload.telegram_deep_link)}
                alt="QR"
                className="rounded-md border border-line bg-white
                  p-3"
                width={220}
                height={220}
              />
              <p className="text-xs text-ink-muted mt-3
                max-w-[240px]">
                Отсканируйте с телефона — Telegram привяжет
                аккаунт автоматически.
              </p>
            </div>
            <div>
              <div className="label-caps mb-3">Или ввести вручную</div>
              <p className="text-sm text-ink-secondary mb-2">
                Откройте бот{' '}
                <a
                  href={payload.telegram_deep_link}
                  target="_blank"
                  rel="noreferrer"
                >
                  @loik_bot
                </a>{' '}
                и отправьте:
              </p>
              <div className="font-mono-nums text-sm bg-elev
                border border-line rounded-md px-3 py-2
                text-ink-primary">
                /verify {payload.telegram_verification_code}
              </div>
              <p className="text-xs text-ink-muted mt-3">
                Уведомления по вашему грузу будут приходить в
                этот чат.
              </p>
            </div>
          </div>

          <div className="mt-8 flex justify-between items-center
            border-t border-line-hair pt-6">
            <Link to="/login" className="text-sm
              text-ink-secondary hover:text-accent">
              Пропустить пока
            </Link>
            <Button
              onClick={() => {
                sessionStorage.removeItem('loik.register')
                nav('/login')
              }}
            >
              Готово — войти
            </Button>
          </div>
        </Card>
      </div>
    </PublicShell>
  )
}
