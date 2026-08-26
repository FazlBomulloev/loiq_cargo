import { useEffect, useState } from 'react'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { EmptyState } from '@/ui/EmptyState'
import { api, ApiError } from '@/lib/api'
import {
  DebtRow, DebtsResponse, SettleResponse,
} from '@/lib/types'
import { fmtDate, fmtSomoni } from '@/lib/format'
import { useToast } from '@/ui/Toast'

type Filter = 'debt' | 'paid' | 'all'

const FILTER_LABEL: Record<Filter, string> = {
  debt: 'В долге',
  paid: 'Оплачено',
  all: 'Все',
}

export function StaffDebts() {
  const [filter, setFilter] = useState<Filter>('debt')
  const [data, setData] = useState<DebtsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api<DebtsResponse>(`/payments?filter=${filter}`)
      .then((r) => {
        if (!cancelled) setData(r)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        toast.push({ kind: 'crit', text: msg })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filter])

  async function settle(row: DebtRow) {
    setBusy(row.client_code)
    try {
      const res = await api<SettleResponse>(
        '/payments/settle',
        {
          method: 'POST',
          body: { client_code: row.client_code },
        }
      )
      toast.push({
        kind: 'ok',
        text: `Долг ${res.client_code} закрыт: ${
          res.settled_count} тов., ${fmtSomoni(
          res.total_somoni)}`,
      })
      setData((d) => d && ({
        ...d,
        rows: d.rows.filter(
          (r) => r.client_id !== row.client_id ||
            r.payment_status !== 'debt'
        ),
      }))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Оплаты и долги
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Клиенты со статусом «долг» после выдачи. Закройте
          долг, когда получили оплату.
        </p>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard
            label="Оплачено, всего"
            value={fmtSomoni(data.summary.delivered_paid_somoni)}
            tone="good"
          />
          <StatCard
            label="Долг, всего"
            value={fmtSomoni(data.summary.delivered_debt_somoni)}
            tone={
              Number(data.summary.delivered_debt_somoni) > 0
                ? 'crit' : 'muted'
            }
          />
          <StatCard
            label="Должников"
            value={`${data.summary.debt_clients} чел.`}
            tone={
              data.summary.debt_clients > 0 ? 'warn' : 'muted'
            }
          />
          <StatCard
            label="Оплатили"
            value={`${data.summary.paid_clients} чел.`}
            tone="muted"
          />
        </div>
      )}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2
          px-4 py-3 border-b border-line-hair">
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

        {loading && !data ? (
          <div className="px-4 py-10 text-center text-ink-muted
            text-sm">
            Загружаем…
          </div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            title={
              filter === 'debt'
                ? 'Долгов нет'
                : 'Пока пусто'
            }
            hint={
              filter === 'debt'
                ? 'Все клиенты в расчёте.'
                : ''
            }
          />
        ) : (
          <Table
            columns={[
              {
                key: 'code',
                header: 'Клиент',
                cell: (r) => (
                  <div>
                    <div className="text-accent-strong
                      font-medium">
                      {r.client_code}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {r.client_full_name}
                    </div>
                  </div>
                ),
              },
              {
                key: 'phone',
                header: 'Телефон',
                cell: (r) => (
                  <div>
                    <div className="font-mono-nums">
                      {r.phone}
                    </div>
                    {r.telegram_verified && (
                      <div className="text-xs text-good">
                        Telegram привязан
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'goods',
                header: 'Товары',
                numeric: true,
                align: 'right',
                cell: (r) => `${r.goods_count} шт`,
              },
              {
                key: 'freight',
                header: 'Фрахт',
                numeric: true,
                align: 'right',
                cell: (r) => fmtSomoni(r.freight_somoni),
              },
              {
                key: 'storage',
                header: 'Простой',
                numeric: true,
                align: 'right',
                cell: (r) =>
                  Number(r.storage_somoni) > 0
                    ? fmtSomoni(r.storage_somoni)
                    : <span className="text-ink-muted">—</span>,
              },
              {
                key: 'total',
                header: 'Сумма',
                numeric: true,
                align: 'right',
                cell: (r) => (
                  <span className="font-medium">
                    {fmtSomoni(r.total_somoni)}
                  </span>
                ),
              },
              {
                key: 'delivered',
                header: 'Выдано',
                align: 'right',
                cell: (r) => fmtDate(r.delivered_at),
              },
              {
                key: 'status',
                header: 'Статус',
                cell: (r) =>
                  r.payment_status === 'debt' ? (
                    <Pill variant="crit">долг</Pill>
                  ) : (
                    <Pill variant="ok">оплачено</Pill>
                  ),
              },
              {
                key: 'act',
                header: '',
                align: 'right',
                cell: (r) =>
                  r.payment_status === 'debt' ? (
                    <button
                      onClick={() => settle(r)}
                      disabled={busy === r.client_code}
                      className="text-sm text-accent
                        hover:text-accent-strong
                        disabled:opacity-50"
                    >
                      {busy === r.client_code
                        ? 'закрываем…' : 'закрыть долг'}
                    </button>
                  ) : null,
              },
            ]}
            rows={data.rows}
            rowKey={(r) =>
              `${r.client_id}-${r.payment_status}`}
            density="dense"
          />
        )}
      </Card>
    </div>
  )
}

function StatCard({
  label, value, tone,
}: {
  label: string
  value: string
  tone: 'good' | 'warn' | 'crit' | 'muted'
}) {
  const toneCls =
    tone === 'good' ? 'text-good' :
      tone === 'warn' ? 'text-warn' :
        tone === 'crit' ? 'text-crit' :
          'text-ink-primary'
  return (
    <div className="rounded-md border border-line bg-card p-4">
      <div className="label-caps">{label}</div>
      <div className={`font-mono-nums text-2xl mt-1 ${toneCls}`}>
        {value}
      </div>
    </div>
  )
}
