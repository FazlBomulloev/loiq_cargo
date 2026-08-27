import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Input } from '@/ui/Input'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { EmptyState } from '@/ui/EmptyState'
import { KPI } from '@/ui/KPI'
import { api } from '@/lib/api'
import {
  DeliveryHistoryPayment,
  DeliveryHistoryPeriod,
  DeliveryHistoryResponse,
} from '@/lib/types'
import { fmtDate, fmtSomoni } from '@/lib/format'
import { useToast } from '@/ui/Toast'

const PERIODS: {
  key: DeliveryHistoryPeriod
  label: string
}[] = [
  { key: '7d', label: '7 дней' },
  { key: '30d', label: '30 дней' },
  { key: '90d', label: '90 дней' },
  { key: 'all', label: 'Всё время' },
]

const PAYMENTS: {
  key: DeliveryHistoryPayment
  label: string
}[] = [
  { key: 'all',  label: 'Все' },
  { key: 'paid', label: 'Оплачено' },
  { key: 'debt', label: 'Долг' },
]

export function StaffDeliveryHistory() {
  const [period, setPeriod] = useState<DeliveryHistoryPeriod>(
    '30d'
  )
  const [payment, setPayment] = useState<DeliveryHistoryPayment>(
    'all'
  )
  const [q, setQ] = useState('')
  const [data, setData] = useState<DeliveryHistoryResponse | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          period,
          payment,
        })
        const query = q.trim()
        if (query) params.set('q', query)
        const r = await api<DeliveryHistoryResponse>(
          `/dushanbe/delivery/history?${params}`
        )
        if (!cancelled) setData(r)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        toast.push({ kind: 'crit', text: msg })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [period, payment, q])

  const rows = data?.rows ?? []

  const rangeLabel = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period)
    return p ? p.label.toLowerCase() : ''
  }, [period])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          История выдач
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Все закрытые выдачи по клиентам. Фильтр и поиск —
          сверху.
        </p>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-3 items-end">
          <div>
            <div className="label-caps mb-2">Период</div>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <Chip
                  key={p.key}
                  active={period === p.key}
                  onClick={() => setPeriod(p.key)}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="label-caps mb-2">Оплата</div>
            <div className="flex flex-wrap gap-2">
              {PAYMENTS.map((p) => (
                <Chip
                  key={p.key}
                  active={payment === p.key}
                  onClick={() => setPayment(p.key)}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>
          <Input
            label="Поиск"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="LQ-007 · имя · телефон"
            autoComplete="off"
            hint={
              loading
                ? 'Ищем…'
                : data
                  ? `${data.total_count} выдач за ${rangeLabel}`
                  : undefined
            }
          />
        </div>
      </Card>

      <section className="grid gap-4 sm:grid-cols-3">
        <KPI
          label="Всего к оплате"
          value={
            data ? fmtSomoni(data.total_pay_somoni) : '—'
          }
        />
        <KPI
          label="Оплачено"
          value={
            data ? fmtSomoni(data.total_paid_somoni) : '—'
          }
        />
        <KPI
          label="Долг"
          value={
            data ? fmtSomoni(data.total_debt_somoni) : '—'
          }
        />
      </section>

      <Card padded={false}>
        {rows.length === 0 && !loading ? (
          <EmptyState
            title="Нет выдач по этим фильтрам"
            hint={
              q.trim()
                ? 'Попробуйте очистить поиск или расширить период.'
                : 'Смените период или тип оплаты.'
            }
          />
        ) : (
          <Table
            columns={[
              {
                key: 'date',
                header: 'Дата',
                cell: (r) => fmtDate(r.delivered_at),
              },
              {
                key: 'client',
                header: 'Клиент',
                cell: (r) => (
                  <div>
                    <div className="font-mono-nums
                      text-accent-strong">
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
                  <span className="font-mono-nums text-xs
                    text-ink-secondary">
                    {r.phone}
                  </span>
                ),
              },
              {
                key: 'count',
                header: 'Тов.',
                numeric: true,
                align: 'right',
                cell: (r) => `${r.goods_count}`,
              },
              {
                key: 'freight',
                header: 'Фрахт',
                numeric: true,
                align: 'right',
                cell: (r) => fmtSomoni(r.total_freight_somoni),
              },
              {
                key: 'storage',
                header: 'Простой',
                numeric: true,
                align: 'right',
                cell: (r) =>
                  Number(r.total_storage_somoni) > 0
                    ? fmtSomoni(r.total_storage_somoni)
                    : '—',
              },
              {
                key: 'pay',
                header: 'К оплате',
                numeric: true,
                align: 'right',
                cell: (r) => (
                  <span className="text-accent-strong">
                    {fmtSomoni(r.total_pay_somoni)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Оплата',
                cell: (r) =>
                  r.payment_status === 'paid' ? (
                    <Pill variant="ok">оплачено</Pill>
                  ) : (
                    <Pill variant="crit">долг</Pill>
                  ),
              },
            ]}
            rows={rows}
            rowKey={(r) =>
              `${r.client_id}-${r.delivered_at}-${r.payment_status}`}
            density="regular"
          />
        )}
      </Card>
    </div>
  )
}
