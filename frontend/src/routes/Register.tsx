import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicShell } from '@/ui/PublicShell'
import { Card } from '@/ui/Card'
import { Input } from '@/ui/Input'
import { Button } from '@/ui/Button'
import { api, saveToken } from '@/lib/api'
import { ClientRegisterResponse } from '@/lib/types'
import { useToast } from '@/ui/Toast'

const MIN_PASSWORD = 8

export default function Register() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [agree, setAgree] = useState(false)
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const nav = useNavigate()

  const passwordMismatch =
    password2.length > 0 && password !== password2
  const passwordShort =
    password.length > 0 && password.length < MIN_PASSWORD

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (passwordMismatch || passwordShort || !agree) return
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
      saveToken(r.access_token, r.principal_kind)
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
              autoComplete="name"
            />
            <Input
              label="Телефон"
              type="tel"
              placeholder="+992 900 00 00 00"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              hint="Формат +992 XXX XX XX XX"
            />
            <Input
              label="Город"
              optional
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Пароль"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint={
                  passwordShort
                    ? `Минимум ${MIN_PASSWORD} символов`
                    : 'Минимум 8 символов, желательно 12+'
                }
                error={
                  passwordShort
                    ? `Минимум ${MIN_PASSWORD} символов`
                    : undefined
                }
                autoComplete="new-password"
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
                autoComplete="new-password"
              />
            </div>
            <label className="flex items-start gap-2 text-xs
              text-ink-secondary select-none">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line
                  accent-accent"
              />
              <span>
                Я согласен(-на) на обработку персональных данных
                и с условиями сервиса Loik Cargo.
              </span>
            </label>
            <Button
              type="submit"
              loading={loading}
              disabled={
                !fullName ||
                !phone ||
                password.length < MIN_PASSWORD ||
                passwordMismatch ||
                !agree
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
