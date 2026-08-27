import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { Card } from '@/ui/Card'
import { Input } from '@/ui/Input'
import { Select } from '@/ui/Select'
import { Button } from '@/ui/Button'
import { api } from '@/lib/api'
import { CalcResponse, Warehouse } from '@/lib/types'
import {
  fmtDensity, fmtRate, fmtSomoni, fmtUsd,
} from '@/lib/format'
import { useToast } from '@/ui/Toast'

interface Props {
  warehouses: Warehouse[]
  activeWarehouse: Warehouse | null
}

export function StaffCalc({
  warehouses, activeWarehouse,
}: Props) {
  const [warehouseId, setWarehouseId] = useState<number | null>(
    activeWarehouse?.id ?? warehouses[0]?.id ?? null
  )
  const [volume, setVolume] = useState('')
  const [weight, setWeight] = useState('')
  const [result, setResult] = useState<CalcResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (warehouseId == null && warehouses.length > 0) {
      setWarehouseId(warehouses[0].id)
    }
  }, [warehouses, warehouseId])

  const canCalc = useMemo(() => {
    return (
      warehouseId !== null &&
      Number(weight) > 0 &&
      Number(volume) > 0
    )
  }, [warehouseId, weight, volume])

  async function onCalc(e?: FormEvent) {
    e?.preventDefault()
    if (!canCalc || warehouseId === null) return
    setLoading(true)
    try {
      const r = await api<CalcResponse>('/calc/quote', {
        method: 'POST',
        auth: false,
        body: {
          warehouse_id: warehouseId,
          weight_kg: Number(weight),
          volume_m3: Number(volume),
        },
      })
      setResult(r)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: `Ошибка: ${msg}` })
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setVolume('')
    setWeight('')
    setResult(null)
  }

  const stepLabel = (from: string, to: string | null) =>
    to === null
      ? `≥ ${from} кг/м³`
      : `${from}–${Number(to) - 1} кг/м³`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Калькулятор
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Оценка фрахта по объёму и весу. Плотностной тариф —
          тот же, что применяется при приёмке.
        </p>
      </div>

      <Card>
        <form
          onSubmit={onCalc}
          className="grid gap-5 sm:grid-cols-3"
        >
          <Select
            label="Склад"
            value={warehouseId ?? ''}
            onChange={(e) => setWarehouseId(
              Number(e.target.value) || null
            )}
          >
            <option value="" disabled>
              Выберите
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
          <Input
            label="Объём"
            numeric
            suffix="м³"
            inputMode="decimal"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="0.60"
          />
          <Input
            label="Вес"
            numeric
            suffix="кг"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="80"
          />
          <div className="sm:col-span-3 flex items-center
            justify-between gap-3">
            <button
              type="button"
              onClick={reset}
              disabled={!volume && !weight && !result}
              className="text-sm text-ink-secondary
                hover:text-accent disabled:opacity-50"
            >
              Сбросить
            </button>
            <Button
              type="submit"
              disabled={!canCalc}
              loading={loading}
            >
              Рассчитать
            </Button>
          </div>
        </form>

        {result && (
          <div className="mt-6 rounded-md border border-line
            bg-elev p-5">
            <div className="label-caps mb-3">Оценка</div>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Row
                label="Плотность"
                value={fmtDensity(result.density_kg_m3)}
                hint={`ступень ${stepLabel(
                  result.density_from, result.density_to,
                )}`}
              />
              <Row
                label="Ставка"
                value={fmtRate(result.rate_usd_per_kg)}
              />
              <Row
                label="Стоимость"
                value={
                  <span className="text-accent-strong">
                    ≈ {fmtSomoni(result.freight_somoni)}
                  </span>
                }
                hint={`${fmtUsd(result.freight_usd)} · только
                  фрахт, без простоя`}
              />
            </dl>
            <div className="mt-4 text-xs text-ink-muted">
              Тариф {result.warehouse_name} ·
              курс 1$ = {Number(result.exchange_rate).toFixed(2)} c.
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function Row({
  label, value, hint,
}: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="font-mono-nums text-lg text-ink-primary
        mt-1">
        {value}
      </dd>
      {hint && (
        <div className="text-xs text-ink-muted mt-1">{hint}</div>
      )}
    </div>
  )
}
