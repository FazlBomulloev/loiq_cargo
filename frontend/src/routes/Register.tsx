import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicShell } from '@/ui/PublicShell'
import { Card } from '@/ui/Card'
import { Input } from '@/ui/Input'
import { Button } from '@/ui/Button'
import { api } from '@/lib/api'
import { ClientRegisterResponse } from '@/lib/types'
import { useToast } from '@/ui/Toast'

export default function Register() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const nav = useNavigate()

  const passwordMismatch =
    password2.length > 0 && password !== password2

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (passwordMismatch) return
    setLoading(true)
    try {
      const r = await api<ClientRegisterResponse>(
        '/clients/register',
        {
          method: 'POST',
          auth: false,
          body: {
            full_name: fullName,
            phone,
            city: city || null,
            password,
          },
        }
      )
      sessionStorage.setItem(
        'loik.register',
        JSON.stringify(r)
      )
      nav('/register/verify', { replace: true })
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
          Регистрация клиента
        </h1>
        <Card>
          <form onSubmit={onSubmit} className="grid gap-4">
            <Input
              label="ФИО или название"
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <Input
              label="Телефон"
              type="tel"
              placeholder="+992 900 00 00 00"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Город"
              optional
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Пароль"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="Минимум 6 символов"
              />
              <Input
                label="Повтор пароля"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                error={
                  passwordMismatch
                    ? 'Пароли не совпадают'
                    : undefined
                }
              />
            </div>
            <Button
              type="submit"
              loading={loading}
              disabled={
                !fullName ||
                !phone ||
                password.length < 6 ||
                passwordMismatch
              }
            >
              Создать код
            </Button>
            <div className="text-center text-sm
              text-ink-muted mt-2">
              Уже есть код?{' '}
              <Link to="/login" className="text-accent">
                Войти
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </PublicShell>
  )
}
