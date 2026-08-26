import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { EmptyState } from '@/ui/EmptyState'
import { api } from '@/lib/api'
import { WaybillListRow } from '@/lib/types'
import { fmtDate, fmtKg, fmtM3 } from '@/lib/format'
import { useToast } from '@/ui/Toast'

type Filter = 'incoming' | 'arrived' | 'all'

const FILTER_LABEL: Record<Filter, string> = {
  incoming: 'В пути',
  arrived: 'Принятые',
  all: 'Все',
}

export function StaffWaybills() {
  const [filter, setFilter] = useState<Filter>('incoming')
  const [rows, setRows] = useState<WaybillListRow[]>([])
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api<WaybillListRow[]>(`/dushanbe/waybills?filter=${filter}`)
      .then((r) => {
        if (!cancelled) setRows(r)
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

  const incomingCount = rows.filter(
    (r) => r.status === 'in_transit'
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Накладные
          {filter === 'incoming' && incomingCount > 0 && (
            <span className="text-ink-muted font-sans
              font-normal text-lg ml-3">
              {incomingCount} ожидают
            </span>
          )}
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Партии, отправленные из Китая. Отметьте прибывшие
          товары в накладной и подтвердите приёмку.
        </p>
      </div>

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
            title={
              filter === 'incoming'
                ? 'Партий в пути нет'
                : 'Накладных не найдено'
            }
            hint={
              filter === 'incoming'
                ? 'Как только Китай отправит фуру — она появится здесь.'
                : ''
            }
          />
        ) : (
          <Table
            columns={[
              {
                key: 'number',
                header: '№ партии',
                cell: (r) => (
                  <Link
                    to={`/staff/waybills/${r.id}`}
                    className="text-accent-strong font-medium
                      no-underline"
                  >
                    {r.number}
                  </Link>
                ),
              },
              {
                key: 'warehouse',
                header: 'Склад',
                cell: (r) => r.warehouse_name,
              },
              {
                key: 'status',
                header: 'Статус',
                cell: (r) =>
                  r.status === 'in_transit' ? (
                    <Pill variant="route">в пути</Pill>
                  ) : (
                    <Pill variant="ok">принята</Pill>
                  ),
              },
              {
                key: 'goods',
                header: 'Товаров',
                numeric: true,
                align: 'right',
                cell: (r) => (
                  <span>
                    {r.received_count > 0 && (
                      <span className="text-good">
                        {r.received_count}
                      </span>
                    )}
                    {r.received_count > 0 && ' / '}
                    <span className="text-ink-primary">
                      {r.goods_count}
                    </span>
                    {r.missing_count > 0 && (
                      <span className="text-crit ml-2">
                        · {r.missing_count} недост.
                      </span>
                    )}
                  </span>
                ),
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
                key: 'departed',
                header: 'Отправлена',
                align: 'right',
                cell: (r) => fmtDate(r.departed_at),
              },
              {
                key: 'arrived',
                header: 'Принята',
                align: 'right',
                cell: (r) => fmtDate(r.arrived_at),
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
