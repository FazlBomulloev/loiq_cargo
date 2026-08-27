import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicShell } from '@/ui/PublicShell'
import { Card } from '@/ui/Card'
import { Input } from '@/ui/Input'
import { Button } from '@/ui/Button'
import { api, saveToken } from '@/lib/api'
import { TokenResponse } from '@/lib/types'
import { useToast } from '@/ui/Toast'

export default function Login() {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const nav = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await api<TokenResponse>('/auth/client/login', {
        method: 'POST',
        auth: false,
        body: {
          client_code: code.trim().toUpperCase(),
          password,
        },
      })
      saveToken(r.access_token, r.principal_kind)
      nav('/app', { replace: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell narrow>
      <div className="mx-auto max-w-md">
        <h1 className="font-serif text-3xl font-semibold mb-6">
          Вход в кабинет
        </h1>
        <Card>
          <form onSubmit={onSubmit} className="grid gap-4">
            <Input
              label="Код клиента"
              placeholder="LQ-XXX"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              hint="Формат LQ-NNN, выдаётся при регистрации"
              autoComplete="username"
            />
            <Input
              label="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Button
              type="submit"
              loading={loading}
              disabled={!code || !password}
            >
              Войти
            </Button>
            <div className="text-center text-xs
              text-ink-muted -mt-1">
              Забыли пароль? Напишите в Telegram{' '}
              <a
                href="https://t.me/loiq_cargobot"
                target="_blank"
                rel="noreferrer"
                className="text-accent"
              >
                @loiq_cargobot
              </a>
              , сотрудник восстановит.
            </div>
            <div className="text-center text-sm
              text-ink-muted mt-1">
              Ещё нет кода?{' '}
              <Link to="/register" className="text-accent">
                Зарегистрироваться
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </PublicShell>
  )
}
