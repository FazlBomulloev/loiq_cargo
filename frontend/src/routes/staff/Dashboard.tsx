import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { EmptyState } from '@/ui/EmptyState'
import { api } from '@/lib/api'
import {
  AnalyticsPeriod, OwnerDashboard, StaffMe,
} from '@/lib/types'
import {
  fmtDate, fmtDecimal, fmtSomoni, fmtUsd, fmtUsdK,
} from '@/lib/format'
import { useToast } from '@/ui/Toast'
import { cx } from '@/ui/utils'

interface Props {
  me: StaffMe
}

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  '7d': '7 дней',
  '30d': '30 дней',
  '90d': '90 дней',
  all: 'Всё время',
}

const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  draft: 'черновик',
  in_transit: 'в пути',
  arrived: 'в Душанбе',
  closed: 'закрыта',
}

export function StaffDashboard({ me }: Props) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d')
  const [data, setData] = useState<OwnerDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    if (me.role !== 'owner') return
    let cancelled = false
    setLoading(true)
    api<OwnerDashboard>(`/analytics/owner?period=${period}`)
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
  }, [period, me.role])

  const alerts = useMemo(() => {
    if (!data) return []
    const items: {
      label: string
      count: number
      to: string
      tone: 'crit' | 'warn'
    }[] = []
    if (data.burning_count > 0)
      items.push({
        label: 'горящие товары',
        count: data.burning_count,
        to: '/staff/goods',
        tone: 'crit',
      })
    if (data.missing_count > 0)
      items.push({
        label: 'недостача',
        count: data.missing_count,
        to: '/staff/waybills?filter=arrived',
        tone: 'crit',
      })
    if (data.unclaimed_count > 0)
      items.push({
        label: 'без клиента',
        count: data.unclaimed_count,
        to: '/staff/unclaimed',
        tone: 'warn',
      })
    if (data.pending_requests > 0)
      items.push({
        label: 'заявок ждут',
        count: data.pending_requests,
        to: '/staff/requests',
        tone: 'warn',
      })
    if (data.storage_pending_goods > 0)
      items.push({
        label: 'копят простой',
        count: data.storage_pending_goods,
        to: '/staff/debts',
        tone: 'warn',
      })
    return items
  }, [data])

  if (me.role !== 'owner') {
    return (
      <EmptyState
        title="Только для овнера"
        hint="Общий дашборд видит только владелец карго."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between
        gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">
            Дашборд
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Ключевые цифры по всем складам за выбранный период.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERIOD_LABEL) as AnalyticsPeriod[]).map(
            (p) => (
              <Chip
                key={p}
                active={period === p}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABEL[p]}
              </Chip>
            )
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="text-sm text-ink-muted">Загружаем…</div>
      ) : !data ? (
        <EmptyState
          title="Нет данных"
          hint="Похоже, аналитика ещё не собрана."
        />
      ) : (
        <>
          {alerts.length > 0 && (
            <Card padded={false}>
              <div className="flex flex-wrap gap-4 p-4">
                {alerts.map((a) => (
                  <Link
                    key={a.label}
                    to={a.to}
                    className="no-underline flex items-center
                      gap-2 group"
                  >
                    <Pill variant={a.tone}>
                      {a.count} {a.label}
                    </Pill>
                    <span className="text-xs text-ink-muted
                      group-hover:text-accent">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <BigTile
              label={`Выручка · ${PERIOD_LABEL[period]}`}
              value={fmtSomoni(data.revenue_somoni)}
              hint={
                `оплачено ${fmtSomoni(data.revenue_paid_somoni)}` +
                (Number(data.revenue_debt_somoni) > 0
                  ? ` · долг ${fmtSomoni(
                    data.revenue_debt_somoni
                  )}`
                  : '')
              }
              tone={
                Number(data.revenue_debt_somoni) > 0
                  ? 'warn' : 'good'
              }
            />
            <BigTile
              label="Выдач"
              value={`${data.delivered_count} тов.`}
              hint={
                data.new_clients_in_period > 0
                  ? `+${data.new_clients_in_period} новых клиентов`
                  : 'новых клиентов нет'
              }
            />
            <BigTile
              label="Партий отправлено"
              value={`${data.shipments_count}`}
              hint={
                data.avg_shipment_cost_usd
                  ? `средняя фура ${fmtUsdK(
                    data.avg_shipment_cost_usd
                  )}`
                  : '—'
              }
            />
            <BigTile
              label="Средняя заполненность"
              value={
                data.avg_fill_pct != null
                  ? `${fmtDecimal(data.avg_fill_pct, 0)} %`
                  : '—'
              }
              hint="цель 90%"
              tone={
                data.avg_fill_pct != null &&
                Number(data.avg_fill_pct) >= 90
                  ? 'good' : 'neutral'
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-6">
            <MiniTile
              label="в Китае"
              value={data.in_china}
            />
            <MiniTile
              label="в пути"
              value={data.in_transit}
            />
            <MiniTile
              label="в Душанбе"
              value={data.in_dushanbe}
            />
            <MiniTile
              label="горят"
              value={data.burning_count}
              tone={data.burning_count > 0 ? 'crit' : 'neutral'}
            />
            <MiniTile
              label="недостача"
              value={data.missing_count}
              tone={data.missing_count > 0 ? 'crit' : 'neutral'}
            />
            <MiniTile
              label="простой ждёт"
              value={fmtSomoni(data.storage_pending_somoni)}
              tone={
                Number(data.storage_pending_somoni) > 0
                  ? 'warn' : 'neutral'
              }
            />
          </div>

          <Card title="По складам">
            <Table
              columns={[
                {
                  key: 'wh',
                  header: 'Склад',
                  cell: (r) => r.warehouse_name,
                },
                {
                  key: 'active',
                  header: 'Активные',
                  numeric: true,
                  align: 'right',
                  cell: (r) => `${r.active_goods} тов.`,
                },
                {
                  key: 'burn',
                  header: 'Горит',
                  numeric: true,
                  align: 'right',
                  cell: (r) =>
                    r.burning_goods > 0 ? (
                      <span className="text-crit">
                        {r.burning_goods}
                      </span>
                    ) : (
                      <span className="text-ink-muted">
                        {r.burning_goods}
                      </span>
                    ),
                },
                {
                  key: 'uncl',
                  header: 'Без клиента',
                  numeric: true,
                  align: 'right',
                  cell: (r) =>
                    r.unclaimed_goods > 0 ? (
                      <span className="text-warn">
                        {r.unclaimed_goods}
                      </span>
                    ) : (
                      <span className="text-ink-muted">
                        {r.unclaimed_goods}
                      </span>
                    ),
                },
                {
                  key: 'sh',
                  header: 'Партий',
                  numeric: true,
                  align: 'right',
                  cell: (r) => r.shipments_in_period,
                },
                {
                  key: 'rev',
                  header: `Выручка · ${PERIOD_LABEL[period]}`,
                  numeric: true,
                  align: 'right',
                  cell: (r) => fmtSomoni(r.revenue_somoni),
                },
              ]}
              rows={data.warehouses}
              rowKey={(r) => r.warehouse_id}
              density="regular"
            />
          </Card>

          <Card
            title="Последние партии"
            actions={
              <Link
                to="/staff/shipments"
                className="text-sm text-accent
                  hover:text-accent-strong no-underline"
              >
                все партии →
              </Link>
            }
            padded={false}
          >
            {data.recent_shipments.length === 0 ? (
              <div className="px-6 py-8 text-center
                text-ink-muted text-sm">
                Партий пока нет.
              </div>
            ) : (
              <Table
                columns={[
                  {
                    key: 'num',
                    header: '№',
                    cell: (r) => (
                      <span className="text-accent-strong
                        font-medium">
                        {r.number}
                      </span>
                    ),
                  },
                  {
                    key: 'wh',
                    header: 'Склад',
                    cell: (r) => r.warehouse_name,
                  },
                  {
                    key: 'status',
                    header: 'Статус',
                    cell: (r) => (
                      <Pill
                        variant={
                          r.status === 'in_transit'
                            ? 'route'
                            : r.status === 'arrived'
                              ? 'info'
                              : r.status === 'closed'
                                ? 'ok'
                                : 'neutral'
                        }
                      >
                        {SHIPMENT_STATUS_LABEL[r.status] ??
                          r.status}
                      </Pill>
                    ),
                  },
                  {
                    key: 'gc',
                    header: 'Товаров',
                    numeric: true,
                    align: 'right',
                    cell: (r) => `${r.goods_count} шт`,
                  },
                  {
                    key: 'fill',
                    header: 'Заполн.',
                    numeric: true,
                    align: 'right',
                    cell: (r) =>
                      r.fill_pct != null
                        ? `${fmtDecimal(r.fill_pct, 0)} %`
                        : '—',
                  },
                  {
                    key: 'cost',
                    header: 'Сумма',
                    numeric: true,
                    align: 'right',
                    cell: (r) => fmtUsd(r.total_cost_usd),
                  },
                  {
                    key: 'departed',
                    header: 'Ушла',
                    align: 'right',
                    cell: (r) => fmtDate(r.departed_at),
                  },
                ]}
                rows={data.recent_shipments}
                rowKey={(r) => r.id}
                density="dense"
              />
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function BigTile({
  label, value, hint, tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'good' | 'warn' | 'crit'
}) {
  const toneCls =
    tone === 'good' ? 'text-good' :
      tone === 'warn' ? 'text-warn' :
        tone === 'crit' ? 'text-crit' :
          'text-ink-primary'
  return (
    <div className="rounded-md border border-line bg-card p-5
      shadow-card">
      <div className="label-caps">{label}</div>
      <div className={cx(
        'mt-2 text-2xl font-semibold font-mono-nums',
        toneCls,
      )}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-ink-muted">
          {hint}
        </div>
      )}
    </div>
  )
}

function MiniTile({
  label, value, tone,
}: {
  label: string
  value: number | string
  tone?: 'neutral' | 'good' | 'warn' | 'crit'
}) {
  const toneCls =
    tone === 'good' ? 'text-good' :
      tone === 'warn' ? 'text-warn' :
        tone === 'crit' ? 'text-crit' :
          'text-ink-primary'
  return (
    <div className="rounded-md border border-line bg-card p-3">
      <div className="label-caps text-[10px]">{label}</div>
      <div className={cx(
        'mt-1 text-lg font-mono-nums',
        toneCls,
      )}>
        {value}
      </div>
    </div>
  )
}
