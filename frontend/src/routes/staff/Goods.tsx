import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { api } from '@/lib/api'
import {
  GoodsListRow,
  StaffMe,
  Warehouse,
  WarehouseCounters,
} from '@/lib/types'
import {
  fmtDate, fmtDensity, fmtKg, fmtM3,
} from '@/lib/format'
import { statusLabel, statusVariant } from '@/lib/statusText'
import { useToast } from '@/ui/Toast'
import { Input } from '@/ui/Input'

type Filter =
  | 'all' | 'in_china' | 'ready_to_ship'
  | 'burning' | 'unclaimed'

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Все',
  in_china: 'На складе',
  ready_to_ship: 'Готов к отправке',
  burning: 'Горит',
  unclaimed: 'Без клиента',
}

interface Props {
  me: StaffMe
  activeWarehouse: Warehouse | null
  warehouses: Warehouse[]
}

export function StaffGoods({
  me, activeWarehouse, warehouses,
}: Props) {
  const [warehouseId, setWarehouseId] = useState<number | null>(
    activeWarehouse?.id ?? warehouses[0]?.id ?? null
  )
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<GoodsListRow[]>([])
  const [counters, setCounters] = useState<
    WarehouseCounters | null
  >(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!warehouseId) return
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ filter })
        if (q.trim()) params.set('q', q.trim())
        const [list, c] = await Promise.all([
          api<GoodsListRow[]>(
            `/warehouses/${warehouseId}/goods?${params}`
          ),
          api<WarehouseCounters>(
            `/warehouses/${warehouseId}/counters`
          ),
        ])
        if (cancelled) return
        setRows(list)
        setCounters(c)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) {
          toast.push({ kind: 'crit', text: msg })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [warehouseId, filter, q])

  const showOwnerPicker =
    me.role === 'owner' && warehouses.length > 1

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">
            Товары склада
            {activeWarehouse && (
              <span className="text-ink-muted font-sans
                font-normal text-lg ml-3">
                {activeWarehouse.name}
              </span>
            )}
          </h1>
          {counters && (
            <div className="mt-1 text-sm text-ink-muted
              flex flex-wrap gap-x-4 gap-y-1">
              <span>всего {counters.total}</span>
              <span>· на складе {counters.in_china}</span>
              <span>
                · готов к отправке {counters.ready_to_ship}
              </span>
              {counters.burning > 0 && (
                <span className="text-crit">
                  · горит {counters.burning}
                </span>
              )}
              {counters.unclaimed > 0 && (
                <span className="text-warn">
                  · без клиента {counters.unclaimed}
                </span>
              )}
            </div>
          )}
        </div>
        <Link to="/staff/receive">
          <Button>+ Приёмка</Button>
        </Link>
      </div>

      {showOwnerPicker && (
        <div className="flex flex-wrap gap-2">
          {warehouses.map((w) => (
            <Chip
              key={w.id}
              active={w.id === warehouseId}
              onClick={() => setWarehouseId(w.id)}
            >
              {w.name}
            </Chip>
          ))}
        </div>
      )}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3
          px-4 py-3 border-b border-line-hair">
          <div className="flex flex-wrap gap-2 flex-1">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => {
              const count =
                f === 'burning' ? counters?.burning :
                  f === 'unclaimed' ? counters?.unclaimed :
                    f === 'ready_to_ship'
                      ? counters?.ready_to_ship :
                      undefined
              return (
                <Chip
                  key={f}
                  active={filter === f}
                  onClick={() => setFilter(f)}
                  count={count ?? undefined}
                >
                  {FILTER_LABEL[f]}
                </Chip>
              )
            })}
          </div>
          <div className="w-64">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по LQ-коду или описанию"
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
              q || filter !== 'all'
                ? 'По фильтру ничего не найдено'
                : 'Товаров пока нет'
            }
            hint={
              q || filter !== 'all' ? (
                <button
                  onClick={() => {
                    setQ('')
                    setFilter('all')
                  }}
                  className="text-accent"
                >
                  Сбросить фильтры
                </button>
              ) : (
                'Оформите первую приёмку кнопкой справа сверху.'
              )
            }
          />
        ) : (
          <Table
            columns={[
              {
                key: 'code',
                header: 'Код',
                numeric: true,
                cell: (r) => (
                  <span className={
                    r.is_unclaimed
                      ? 'text-warn'
                      : 'text-accent-strong'
                  }>
                    {r.client_code || 'без клиента'}
                  </span>
                ),
              },
              {
                key: 'desc',
                header: 'Товар',
                cell: (r) =>
                  r.description || (
                    <span className="text-ink-muted italic">
                      без описания
                    </span>
                  ),
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
                key: 'density',
                header: 'Плотн.',
                numeric: true,
                align: 'right',
                cell: (r) => fmtDensity(r.density_kg_m3),
              },
              {
                key: 'status',
                header: 'Статус',
                cell: (r) => (
                  <div className="flex flex-wrap gap-1.5">
                    <Pill variant={statusVariant(r.status)}>
                      {statusLabel(r.status)}
                    </Pill>
                    {r.is_burning && r.burning_days !== null && (
                      <Pill variant="crit"
                        tail={`${r.burning_days} д`}>
                        горит
                      </Pill>
                    )}
                    {r.is_unclaimed && (
                      <Pill variant="warn">без клиента</Pill>
                    )}
                    {r.shipment_number && (
                      <span className="text-xs
                        text-ink-muted font-mono-nums">
                        {r.shipment_number}
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: 'received',
                header: 'Принят',
                align: 'right',
                cell: (r) => fmtDate(r.received_at),
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
