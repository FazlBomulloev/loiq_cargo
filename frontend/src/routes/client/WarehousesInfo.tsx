import { useEffect, useState } from 'react'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { api } from '@/lib/api'
import { Warehouse } from '@/lib/types'
import { fmtUsd } from '@/lib/format'
import { useToast } from '@/ui/Toast'

interface ActiveTariff {
  id: number
  warehouse_id: number
  currency: string
  effective_from: string
  rows: {
    density_from: string
    density_to: string | null
    rate_usd_per_kg: string | null
    rate_usd_per_m3: string | null
  }[]
}

export function ClientWarehousesInfo() {
  const [wh, setWh] = useState<Warehouse[]>([])
  const [tariffs, setTariffs] = useState<
    Record<number, ActiveTariff | null>
  >({})
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    api<Warehouse[]>('/warehouses', { auth: false })
      .then(async (rows) => {
        if (cancelled) return
        setWh(rows)
        if (rows.length) setActiveId(rows[0].id)
        const entries = await Promise.all(
          rows.map(async (w): Promise<
            [number, ActiveTariff | null]
          > => {
            try {
              const t = await api<ActiveTariff>(
                `/warehouses/${w.id}/active-tariff`,
                { auth: false }
              )
              return [w.id, t]
            } catch {
              return [w.id, null]
            }
          })
        )
        if (!cancelled) {
          setTariffs(Object.fromEntries(entries))
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        toast.push({ kind: 'crit', text: msg })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const active = wh.find((w) => w.id === activeId) ?? null
  const activeTariff = active ? tariffs[active.id] ?? null : null

  if (loading && wh.length === 0) {
    return null
  }

  return (
    <Card title="Наши склады и тарифы">
      <div className="flex flex-wrap gap-2 mb-4">
        {wh.map((w) => (
          <Chip
            key={w.id}
            active={w.id === activeId}
            onClick={() => setActiveId(w.id)}
          >
            {w.name}
          </Chip>
        ))}
      </div>

      {active && (
        <div className="space-y-4">
          <div>
            <div className="label-caps">Адрес склада</div>
            <div className="text-sm mt-1 whitespace-pre-line">
              {active.address || (
                <span className="text-ink-muted italic">
                  адрес пока не указан
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="label-caps mb-2">
              Плотностной тариф
            </div>
            {activeTariff && activeTariff.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line-strong">
                      <th className="label-caps px-3 py-2 text-left">
                        Плотность, кг/м³
                      </th>
                      <th className="label-caps px-3 py-2 text-right">
                        Ставка
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...activeTariff.rows]
                      .sort(
                        (a, b) =>
                          Number(a.density_from) -
                          Number(b.density_from)
                      )
                      .map((r, i) => {
                        const isM3 = r.rate_usd_per_m3 != null
                        const rate = isM3
                          ? Number(r.rate_usd_per_m3)
                          : Number(r.rate_usd_per_kg)
                        const from = Number(r.density_from)
                        const to = r.density_to
                          ? Number(r.density_to) - 1
                          : null
                        return (
                          <tr
                            key={i}
                            className="border-b border-line-hair"
                          >
                            <td className="px-3 py-1.5 font-mono-nums">
                              {to === null
                                ? `≥ ${from}`
                                : from === 0
                                  ? `до ${to}`
                                  : `${from} – ${to}`}
                            </td>
                            <td className="px-3 py-1.5 text-right
                              font-mono-nums">
                              {fmtUsd(rate)}
                              <span className="text-ink-muted
                                ml-1">
                                {isM3 ? '/м³' : '/кг'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-ink-muted">
                активного тарифа нет
              </div>
            )}
            <div className="text-xs text-ink-muted mt-2">
              Плотность = вес / объём. До 200 кг/м³ считаем за м³,
              выше — за кг по бракету.
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
