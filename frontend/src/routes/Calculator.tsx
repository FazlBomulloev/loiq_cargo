import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { PublicShell } from '@/ui/PublicShell'
import { Card } from '@/ui/Card'
import { Input } from '@/ui/Input'
import { Select } from '@/ui/Select'
import { Button } from '@/ui/Button'
import { api } from '@/lib/api'
import { CalcResponse, Warehouse } from '@/lib/types'
import {
  fmtDensity, fmtRate, fmtRateM3, fmtSomoni, fmtUsd,
} from '@/lib/format'
import { useToast } from '@/ui/Toast'
import { Link } from 'react-router-dom'

export default function Calculator() {
  const [wh, setWh] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<number | null>(
    null
  )
  const [volume, setVolume] = useState('')
  const [weight, setWeight] = useState('')
  const [result, setResult] = useState<CalcResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    api<Warehouse[]>('/warehouses', { auth: false })
      .then((rows) => {
        setWh(rows)
        if (rows.length && warehouseId === null) {
          setWarehouseId(rows[0].id)
        }
      })
      .catch((e) => toast.push({
        kind: 'crit',
        text: `Не удалось загрузить склады: ${e.message}`,
      }))
  }, [])

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

  const stepLabel = (from: string, to: string | null) =>
    to === null
      ? `≥ ${from} кг/м³`
      : `${from}–${Number(to) - 1} кг/м³`

  return (
    <PublicShell narrow>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-semibold">
          Сколько будет доставка?
        </h1>
        <p className="mt-2 text-ink-secondary">
          Плотностной тариф Loik. Считаем как реальную
          отгрузку — без регистрации.
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
            {wh.map((w) => (
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
            justify-end">
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
                value={
                  result.mode === 'per_m3' &&
                  result.rate_usd_per_m3 != null
                    ? fmtRateM3(result.rate_usd_per_m3)
                    : fmtRate(result.rate_usd_per_kg)
                }
                hint={
                  result.mode === 'per_m3'
                    ? `лёгкий ≤ ${result.density_to
                        ? Number(result.density_to) - 1
                        : 200} кг/м³ — считаем за м³`
                    : undefined
                }
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

      <div className="mt-6 flex justify-center text-sm">
        <Link to="/register" className="text-ink-secondary
          hover:text-accent">
          Оформить постоянный код клиента →
        </Link>
      </div>
    </PublicShell>
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
