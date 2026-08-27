import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PublicShell } from '@/ui/PublicShell'
import { Card } from '@/ui/Card'
import { Input } from '@/ui/Input'
import { Button } from '@/ui/Button'
import { api, saveToken } from '@/lib/api'
import { TokenResponse } from '@/lib/types'
import { useToast } from '@/ui/Toast'

export default function StaffLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const nav = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await api<TokenResponse>('/auth/staff/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      })
      saveToken(r.access_token, r.principal_kind)
      nav('/staff', { replace: true })
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
        <h1 className="font-serif text-3xl font-semibold mb-2">
          Вход сотрудника
        </h1>
        <p className="text-sm text-ink-muted mb-6">
          Для сотрудников складов и овнера.
        </p>
        <Card>
          <form onSubmit={onSubmit} className="grid gap-4">
            <Input
              label="Email"
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
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
              disabled={!email || !password}
            >
              Войти
            </Button>
          </form>
        </Card>
      </div>
    </PublicShell>
  )
}
