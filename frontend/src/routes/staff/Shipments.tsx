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
  ShipmentDetail, ShipmentListRow, ShipmentStatus,
  StaffMe, Warehouse,
} from '@/lib/types'
import {
  fmtDate, fmtDecimal, fmtKg, fmtM3, fmtUsd,
} from '@/lib/format'
import { useToast } from '@/ui/Toast'

type Filter = 'all' | 'in_transit' | 'arrived' | 'closed'

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Все',
  in_transit: 'В пути',
  arrived: 'Прибыли',
  closed: 'Закрыты',
}

const STATUS_LABEL: Record<ShipmentStatus, string> = {
  draft: 'черновик',
  in_transit: 'в пути',
  arrived: 'в Душанбе',
  closed: 'закрыта',
}

const STATUS_VARIANT: Record<
  ShipmentStatus,
  'neutral' | 'info' | 'ok' | 'route'
> = {
  draft: 'neutral',
  in_transit: 'route',
  arrived: 'info',
  closed: 'ok',
}

interface Props {
  me: StaffMe
  activeWarehouse: Warehouse | null
  warehouses: Warehouse[]
}

export function StaffShipments({
  me, activeWarehouse, warehouses,
}: Props) {
  const [warehouseId, setWarehouseId] = useState<number | null>(
    activeWarehouse?.id ?? warehouses[0]?.id ?? null
  )
  const [filter, setFilter] = useState<Filter>('all')
  const [rows, setRows] = useState<ShipmentListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ShipmentDetail | null>(
    null
  )
  const toast = useToast()

  useEffect(() => {
    if (!warehouseId) return
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ filter })
    api<ShipmentListRow[]>(
      `/warehouses/${warehouseId}/shipments?${params}`
    )
      .then((res) => {
        if (!cancelled) setRows(res)
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
  }, [warehouseId, filter])

  useEffect(() => {
    if (openId == null) {
      setDetail(null)
      return
    }
    let cancelled = false
    api<ShipmentDetail>(`/shipments/${openId}`)
      .then((res) => {
        if (!cancelled) setDetail(res)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        toast.push({ kind: 'crit', text: msg })
      })
    return () => {
      cancelled = true
    }
  }, [openId])

  const showOwnerPicker =
    me.role !== 'china_staff' && warehouses.length > 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between
        gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">
            Партии
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Отправленные фуры и их состав.
          </p>
        </div>
        <Link to="/staff/dispatch">
          <Button>+ Новая отправка</Button>
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

        {loading && rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-ink-muted
            text-sm">
            Загружаем…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Партий пока нет"
            hint={
              <Link to="/staff/dispatch" className="text-accent">
                Соберите первую фуру
              </Link>
            }
          />
        ) : (
          <Table
            columns={[
              {
                key: 'number',
                header: '№',
                cell: (r) => (
                  <button
                    onClick={() => setOpenId(r.id)}
                    className="text-accent-strong font-medium"
                  >
                    {r.number}
                  </button>
                ),
              },
              {
                key: 'status',
                header: 'Статус',
                cell: (r) => (
                  <Pill variant={STATUS_VARIANT[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </Pill>
                ),
              },
              {
                key: 'count',
                header: 'Товары',
                numeric: true,
                align: 'right',
                cell: (r) => `${r.goods_count} шт`,
              },
              {
                key: 'weight',
                header: 'Вес',
                numeric: true,
                align: 'right',
                cell: (r) => fmtKg(r.total_weight_kg),
              },
              {
                key: 'volume',
                header: 'Объём',
                numeric: true,
                align: 'right',
                cell: (r) => fmtM3(r.total_volume_m3),
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
                header: 'Отправлена',
                align: 'right',
                cell: (r) => fmtDate(r.departed_at),
              },
            ]}
            rows={rows}
            rowKey={(r) => r.id}
            density="dense"
          />
        )}
      </Card>

      {openId != null && (
        <ShipmentDrawer
          detail={detail}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

function ShipmentDrawer({
  detail, onClose,
}: {
  detail: ShipmentDetail | null
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-ink-primary/20
        flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-card border-l border-line
          overflow-y-auto"
      >
        {detail == null ? (
          <div className="p-4 sm:p-6 text-ink-muted text-sm">
            Загружаем…
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="label-caps">Партия</div>
                <h2 className="font-serif text-2xl font-semibold
                  mt-0.5">
                  {detail.number}
                </h2>
                <div className="text-sm text-ink-muted mt-1">
                  {detail.warehouse_name} · {STATUS_LABEL[
                    detail.status
                  ]}
                  {detail.departed_at && (
                    <> · отправлена {fmtDate(detail.departed_at)}
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-ink-secondary hover:text-accent"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
              <Metric
                label="Товаров"
                value={`${detail.goods.length} шт`}
              />
              <Metric
                label="Вес"
                value={fmtKg(detail.total_weight_kg)}
              />
              <Metric
                label="Объём"
                value={fmtM3(detail.total_volume_m3)}
              />
              <Metric
                label="Заполн."
                value={
                  detail.fill_pct != null
                    ? `${fmtDecimal(detail.fill_pct, 0)} %`
                    : '—'
                }
              />
              <Metric
                label="Сумма"
                value={fmtUsd(detail.total_cost_usd)}
              />
              <Metric
                label="Лимит фуры"
                value={
                  detail.truck_weight_kg
                    ? fmtKg(detail.truck_weight_kg)
                    : '—'
                }
              />
            </div>

            {detail.note && (
              <div className="rounded-md border border-line
                bg-elev p-3 text-sm">
                <div className="label-caps mb-1">Комментарий</div>
                {detail.note}
              </div>
            )}

            <div>
              <div className="label-caps mb-2">Состав</div>
              <Table
                columns={[
                  {
                    key: 'code',
                    header: 'Код',
                    cell: (r) => (
                      <span className={
                        r.client_code
                          ? 'text-accent-strong'
                          : 'text-warn'
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
                    key: 'freight',
                    header: 'Фрахт',
                    numeric: true,
                    align: 'right',
                    cell: (r) => fmtUsd(r.freight_usd),
                  },
                ]}
                rows={detail.goods}
                rowKey={(r) => r.id}
                density="dense"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({
  label, value,
}: { label: string; value: string }) {
  return (
    <div>
      <div className="label-caps">{label}</div>
      <div className="font-mono-nums text-lg mt-0.5">{value}</div>
    </div>
  )
}
