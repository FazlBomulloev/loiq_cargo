import { FormEvent, useEffect, useState } from 'react'
import { Card } from '@/ui/Card'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { EmptyState } from '@/ui/EmptyState'
import { api, ApiError } from '@/lib/api'
import { StaffMe, StaffRow, Warehouse } from '@/lib/types'
import { fmtDateFull } from '@/lib/format'
import { useToast } from '@/ui/Toast'

interface Props {
  me: StaffMe
  warehouses: Warehouse[]
}

const ROLE_LABEL: Record<StaffRow['role'], string> = {
  china_staff: 'Склад Китая',
  dushanbe_staff: 'Склад Душанбе',
  owner: 'Овнер',
}

export function StaffAdmin({ me, warehouses }: Props) {
  const isOwner = me.role === 'owner'
  const [rows, setRows] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [passwordFor, setPasswordFor] = useState<StaffRow | null>(
    null
  )
  const toast = useToast()

  async function reload() {
    setLoading(true)
    try {
      const r = await api<StaffRow[]>('/staff')
      setRows(r)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOwner) void reload()
  }, [isOwner])

  async function toggleActive(row: StaffRow) {
    try {
      const updated = await api<StaffRow>(
        `/staff/${row.id}`,
        {
          method: 'PATCH',
          body: { is_active: !row.is_active },
        }
      )
      setRows((xs) =>
        xs.map((r) => (r.id === updated.id ? updated : r))
      )
      toast.push({
        kind: 'ok',
        text: updated.is_active
          ? `${updated.full_name} активирован`
          : `${updated.full_name} деактивирован`,
      })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    }
  }

  if (!isOwner) {
    return (
      <EmptyState
        title="Только для овнера"
        hint="Управление сотрудниками доступно только владельцу."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">
            Сотрудники
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Сотрудники складов Китая, Душанбе и другие овнеры.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          + Новый сотрудник
        </Button>
      </div>

      {showForm && (
        <StaffCreateForm
          warehouses={warehouses}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            void reload()
          }}
        />
      )}

      <Card padded={false}>
        {loading && rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-ink-muted
            text-sm">
            Загружаем…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Сотрудников нет" />
        ) : (
          <Table
            columns={[
              {
                key: 'name',
                header: 'Имя',
                cell: (r) => (
                  <div>
                    <div className="text-ink-primary font-medium">
                      {r.full_name}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {r.email}
                    </div>
                  </div>
                ),
              },
              {
                key: 'role',
                header: 'Роль',
                cell: (r) => ROLE_LABEL[r.role],
              },
              {
                key: 'wh',
                header: 'Склад',
                cell: (r) =>
                  r.warehouse_name || (
                    <span className="text-ink-muted">—</span>
                  ),
              },
              {
                key: 'created',
                header: 'Создан',
                align: 'right',
                cell: (r) => fmtDateFull(r.created_at),
              },
              {
                key: 'active',
                header: 'Статус',
                cell: (r) =>
                  r.is_active ? (
                    <Pill variant="ok">активен</Pill>
                  ) : (
                    <Pill variant="neutral">отключён</Pill>
                  ),
              },
              {
                key: 'act',
                header: '',
                align: 'right',
                cell: (r) => (
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setPasswordFor(r)}
                      className="text-sm text-ink-secondary
                        hover:text-accent"
                    >
                      пароль
                    </button>
                    <button
                      onClick={() => toggleActive(r)}
                      className={
                        r.is_active
                          ? 'text-sm text-ink-secondary ' +
                            'hover:text-crit'
                          : 'text-sm text-accent ' +
                            'hover:text-accent-strong'
                      }
                    >
                      {r.is_active ? 'отключить' : 'включить'}
                    </button>
                  </div>
                ),
              },
            ]}
            rows={rows}
            rowKey={(r) => r.id}
            density="dense"
          />
        )}
      </Card>

      {passwordFor && (
        <PasswordDrawer
          user={passwordFor}
          onClose={() => setPasswordFor(null)}
        />
      )}
    </div>
  )
}

function StaffCreateForm({
  warehouses, onClose, onCreated,
}: {
  warehouses: Warehouse[]
  onClose: () => void
  onCreated: () => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<StaffRow['role']>(
    'china_staff'
  )
  const [warehouseId, setWarehouseId] = useState<number | null>(
    warehouses[0]?.id ?? null
  )
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const needsWh = role === 'china_staff'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (needsWh && !warehouseId) {
      toast.push({
        kind: 'warn',
        text: 'Для сотрудника Китая нужно выбрать склад',
      })
      return
    }
    setSaving(true)
    try {
      await api<StaffRow>('/staff', {
        method: 'POST',
        body: {
          email: email.trim(),
          full_name: fullName.trim(),
          password,
          role,
          warehouse_id: needsWh ? warehouseId : null,
        },
      })
      toast.push({
        kind: 'ok', text: 'Сотрудник создан',
      })
      onCreated()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Новый сотрудник"
      actions={
        <button
          onClick={onClose}
          className="text-ink-secondary hover:text-accent"
        >
          ✕
        </button>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4
        sm:grid-cols-2">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
        />
        <Input
          label="ФИО"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint="минимум 6 символов"
        />
        <div>
          <div className="mb-1 text-sm text-ink-secondary
            font-medium">
            Роль
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              ['china_staff', 'dushanbe_staff', 'owner'] as const
            ).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={
                  role === r
                    ? 'rounded-md bg-accent-tint ' +
                      'text-accent-strong font-medium ' +
                      'px-3 py-1.5 text-sm'
                    : 'rounded-md border border-line ' +
                      'text-ink-secondary hover:bg-hover ' +
                      'px-3 py-1.5 text-sm'
                }
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        {needsWh && (
          <div className="sm:col-span-2">
            <div className="mb-1 text-sm text-ink-secondary
              font-medium">
              Склад Китая
            </div>
            <div className="flex flex-wrap gap-2">
              {warehouses.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWarehouseId(w.id)}
                  className={
                    w.id === warehouseId
                      ? 'rounded-md bg-accent-tint ' +
                        'text-accent-strong font-medium ' +
                        'px-3 py-1.5 text-sm'
                      : 'rounded-md border border-line ' +
                        'text-ink-secondary hover:bg-hover ' +
                        'px-3 py-1.5 text-sm'
                  }
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="sm:col-span-2 flex justify-end gap-2
          border-t border-line-hair pt-4">
          <Button
            variant="ghost"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            loading={saving}
            disabled={
              !email || !fullName ||
                password.length < 6
            }
          >
            Создать
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PasswordDrawer({
  user, onClose,
}: {
  user: StaffRow
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function submit() {
    if (password.length < 6) {
      toast.push({
        kind: 'warn', text: 'Минимум 6 символов',
      })
      return
    }
    setSaving(true)
    try {
      await api<void>(`/staff/${user.id}/password`, {
        method: 'POST',
        body: { password },
      })
      toast.push({
        kind: 'ok',
        text: `Пароль ${user.full_name} сброшен`,
      })
      onClose()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-ink-primary/20
        flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border-l border-line
          p-6 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="label-caps">Сброс пароля</div>
            <h2 className="font-serif text-xl font-semibold
              mt-0.5">
              {user.full_name}
            </h2>
            <div className="text-sm text-ink-muted">
              {user.email}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-secondary hover:text-accent"
          >
            ✕
          </button>
        </div>
        <Input
          label="Новый пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="new-password"
        />
        <div className="flex justify-end gap-2 border-t
          border-line-hair pt-4">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={saving}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  )
}
