import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KPI } from '@/ui/KPI'
import { Card } from '@/ui/Card'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { EmptyState } from '@/ui/EmptyState'
import { api } from '@/lib/api'
import {
  ClientAnalytics, ClientMe, ClientSummary, GoodsListItem,
} from '@/lib/types'
import {
  fmtDate, fmtKg, fmtM3, fmtSomoni,
} from '@/lib/format'
import { statusLabel, statusVariant } from '@/lib/statusText'
import { GoodsDrawer } from './GoodsDrawer'
import { ClientWarehousesInfo } from './WarehousesInfo'
import { useToast } from '@/ui/Toast'

interface Props {
  me: ClientMe
}

export function ClientDashboard({ me: _me }: Props) {
  const [summary, setSummary] = useState<ClientSummary | null>(
    null
  )
  const [goods, setGoods] = useState<GoodsListItem[]>([])
  const [analytics, setAnalytics] = useState<
    ClientAnalytics | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<
    GoodsListItem | null
  >(null)
  const toast = useToast()

  useEffect(() => {
    Promise.all([
      api<ClientSummary>('/clients/me/summary'),
      api<GoodsListItem[]>('/clients/me/goods'),
      api<ClientAnalytics>('/clients/me/analytics'),
    ])
      .then(([s, g, a]) => {
        setSummary(s)
        setGoods(g)
        setAnalytics(a)
      })
      .catch((e) => toast.push({
        kind: 'crit',
        text: `Не удалось загрузить данные: ${e.message}`,
      }))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2
        lg:grid-cols-4">
        <KPI
          label="На складе КНР"
          value={summary?.in_china_count ?? '—'}
        />
        <KPI
          label="В пути"
          value={summary?.in_transit_count ?? '—'}
        />
        <KPI
          label="В Душанбе"
          value={summary?.in_dushanbe_count ?? '—'}
          hint={
            summary?.in_dushanbe_oldest_days != null
              ? `самое старое · ${
                summary.in_dushanbe_oldest_days
              } д`
              : undefined
          }
        />
        <KPI
          label="Долг"
          value={
            summary
              ? fmtSomoni(summary.debt_somoni)
              : '—'
          }
        />
      </section>

      <Card
        title="Мой груз"
        actions={
          <Link
            to="/"
            className="text-sm text-ink-secondary
              hover:text-accent"
          >
            Калькулятор
          </Link>
        }
        padded={false}
      >
        {loading ? (
          <div className="p-10 text-center text-ink-muted
            text-sm">
            Загружаем список товаров…
          </div>
        ) : goods.length === 0 ? (
          <EmptyState
            title="Пока нет товаров"
            hint={
              <>
                Как только сотрудник склада примет ваш груз,
                он появится здесь.
                Уведомление придёт в Telegram.
              </>
            }
          />
        ) : (
          <Table
            columns={[
              {
                key: 'desc',
                header: 'Товар',
                cell: (r) =>
                  r.description || 'без описания',
              },
              {
                key: 'wh',
                header: 'Склад',
                cell: (r) => r.warehouse_name,
              },
              {
                key: 'weight',
                header: 'Вес',
                numeric: true,
                align: 'right',
                cell: (r) => fmtKg(r.weight_kg),
              },
              {
                key: 'volume',
                header: 'Объём',
                numeric: true,
                align: 'right',
                cell: (r) => fmtM3(r.volume_m3),
              },
              {
                key: 'status',
                header: 'Статус',
                cell: (r) => (
                  <div className="flex flex-wrap gap-1.5">
                    <Pill variant={statusVariant(r.status)}>
                      {statusLabel(r.status)}
                    </Pill>
                    {r.is_burning &&
                      r.burning_days !== null && (
                      <Pill
                        variant="crit"
                        tail={`${r.burning_days} д`}
                      >
                        горит
                      </Pill>
                    )}
                  </div>
                ),
              },
              {
                key: 'received',
                header: 'Пришёл',
                cell: (r) => fmtDate(r.received_at),
                align: 'right',
              },
            ]}
            rows={goods}
            rowKey={(r) => r.id}
            density="airy"
            onRowClick={(r) => setSelected(r)}
          />
        )}
      </Card>

      {analytics && (
        <Card title="История и итоги">
          <div className="grid gap-4 sm:grid-cols-2
            md:grid-cols-4">
            <StatBlock
              label="Всего выдано"
              value={`${analytics.total_delivered_count} тов.`}
              hint={
                analytics.avg_transit_days != null
                  ? `средний транзит ${
                    analytics.avg_transit_days
                  } дн`
                  : undefined
              }
            />
            <StatBlock
              label="Оплачено"
              value={fmtSomoni(analytics.total_paid_somoni)}
              tone="good"
            />
            <StatBlock
              label="Осталось долга"
              value={fmtSomoni(analytics.total_debt_somoni)}
              tone={
                Number(analytics.total_debt_somoni) > 0
                  ? 'warn' : 'muted'
              }
            />
            <StatBlock
              label="В работе фрахт"
              value={fmtSomoni(
                analytics.active_freight_estimate_somoni
              )}
              hint="прогноз по товарам в пути и на складах"
            />
          </div>
          {analytics.history.length > 0 && (
            <div className="mt-6">
              <div className="label-caps mb-2">Последние выдачи</div>
              <Table
                columns={[
                  {
                    key: 'date',
                    header: 'Дата',
                    cell: (r) => fmtDate(r.delivered_at),
                  },
                  {
                    key: 'count',
                    header: 'Товаров',
                    numeric: true,
                    align: 'right',
                    cell: (r) => `${r.goods_count} шт`,
                  },
                  {
                    key: 'freight',
                    header: 'Фрахт',
                    numeric: true,
                    align: 'right',
                    cell: (r) => fmtSomoni(
                      r.total_freight_somoni
                    ),
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
                rows={analytics.history}
                rowKey={(r) =>
                  `${r.delivered_at}-${r.payment_status}`}
                density="dense"
              />
            </div>
          )}
        </Card>
      )}

      <ClientWarehousesInfo />

      <GoodsDrawer
        item={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

function StatBlock({
  label, value, hint, tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'warn' | 'muted'
}) {
  const toneCls =
    tone === 'good' ? 'text-good' :
      tone === 'warn' ? 'text-warn' :
        tone === 'muted' ? 'text-ink-muted' :
          'text-ink-primary'
  return (
    <div>
      <div className="label-caps">{label}</div>
      <div className={`mt-1 text-xl font-mono-nums ${toneCls}`}>
        {value}
      </div>
      {hint && (
        <div className="text-xs text-ink-muted mt-0.5">
          {hint}
        </div>
      )}
    </div>
  )
}
