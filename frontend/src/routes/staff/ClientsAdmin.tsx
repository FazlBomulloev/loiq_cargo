import { useEffect, useState } from 'react'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Input } from '@/ui/Input'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { EmptyState } from '@/ui/EmptyState'
import { api, ApiError } from '@/lib/api'
import { ClientAdminRow, StaffMe } from '@/lib/types'
import { fmtDateFull } from '@/lib/format'
import { useToast } from '@/ui/Toast'

interface Props {
  me: StaffMe
}

type Filter = 'active' | 'disabled' | 'all'

const FILTER_LABEL: Record<Filter, string> = {
  active: 'Активные',
  disabled: 'Отключённые',
  all: 'Все',
}

export function ClientsAdmin({ me }: Props) {
  const isOwner = me.role === 'owner'
  const [filter, setFilter] = useState<Filter>('active')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ClientAdminRow[]>([])
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set('q', q.trim())
        if (filter === 'active') params.set('active', 'true')
        else if (filter === 'disabled') {
          params.set('active', 'false')
        }
        const r = await api<ClientAdminRow[]>(
          `/clients-admin${params.toString() ? `?${params}` : ''}`
        )
        if (!cancelled) setRows(r)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        toast.push({ kind: 'crit', text: msg })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [q, filter, isOwner])

  async function toggle(row: ClientAdminRow) {
    try {
      const updated = await api<ClientAdminRow>(
        `/clients-admin/${row.id}`,
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
          ? `${updated.client_code} активирован`
          : `${updated.client_code} отключён`,
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
        hint="Управление клиентами доступно только владельцу."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Клиенты
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Список зарегистрированных клиентов. Здесь можно
          отключить учётку, если понадобится.
        </p>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3
          px-4 py-3 border-b border-line-hair">
          <div className="flex flex-wrap gap-2 flex-1">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <Chip
                key={f}
                active={filter === f}
                onClick={() => setFilter(f)}
              >
                {FILTER_LABEL[f]}
              </Chip>
            ))}
          </div>
          <div className="w-full sm:w-72">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Код LQ, имя, телефон"
            />
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-ink-muted
            text-sm">
            Загружаем…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              q
                ? 'По запросу никого нет'
                : 'Клиентов пока нет'
            }
          />
        ) : (
          <Table
            columns={[
              {
                key: 'code',
                header: 'Код',
                cell: (r) => (
                  <span className="text-accent-strong font-medium">
                    {r.client_code}
                  </span>
                ),
              },
              {
                key: 'name',
                header: 'Клиент',
                cell: (r) => (
                  <div>
                    <div>{r.full_name}</div>
                    {r.city && (
                      <div className="text-xs text-ink-muted">
                        {r.city}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'phone',
                header: 'Телефон',
                cell: (r) => (
                  <span className="font-mono-nums">
                    {r.phone}
                  </span>
                ),
              },
              {
                key: 'tg',
                header: 'Telegram',
                cell: (r) =>
                  r.telegram_status === 'verified' ? (
                    <Pill variant="ok">привязан</Pill>
                  ) : r.telegram_status === 'pending' ? (
                    <Pill variant="warn">ожидает</Pill>
                  ) : (
                    <Pill variant="neutral">не начат</Pill>
                  ),
              },
              {
                key: 'goods',
                header: 'Товары',
                numeric: true,
                align: 'right',
                cell: (r) => (
                  <span>
                    <span className="text-ink-primary">
                      {r.active_goods_count}
                    </span>
                    <span className="text-ink-muted">
                      {' / '}{r.goods_count}
                    </span>
                  </span>
                ),
              },
              {
                key: 'created',
                header: 'С нами с',
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
                    <Pill variant="crit">отключён</Pill>
                  ),
              },
              {
                key: 'act',
                header: '',
                align: 'right',
                cell: (r) => (
                  <button
                    onClick={() => toggle(r)}
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
                ),
              },
            ]}
            rows={rows}
            rowKey={(r) => r.id}
            density="dense"
          />
        )}
      </Card>
    </div>
  )
}
