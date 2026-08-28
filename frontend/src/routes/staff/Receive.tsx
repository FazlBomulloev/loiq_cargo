import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Card } from '@/ui/Card'
import { Input } from '@/ui/Input'
import { Button } from '@/ui/Button'
import { Pill } from '@/ui/Pill'
import { api, ApiError } from '@/lib/api'
import {
  CalcResponse,
  ClientLookup,
  GoodsReceiveResponse,
  StaffMe,
  Warehouse,
} from '@/lib/types'
import { fmtDensity, fmtSomoni, fmtUsd } from '@/lib/format'
import { useToast } from '@/ui/Toast'
import { useNavigate } from 'react-router-dom'

interface Props {
  me: StaffMe
  activeWarehouse: Warehouse | null
  warehouses: Warehouse[]
}

export function StaffReceive({
  me, activeWarehouse, warehouses,
}: Props) {
  const [warehouseId, setWarehouseId] = useState<number | null>(
    activeWarehouse?.id ?? warehouses[0]?.id ?? null
  )
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [volume, setVolume] = useState('')
  const [weight, setWeight] = useState('')
  const [acceptWithout, setAcceptWithout] = useState(false)

  const [lookup, setLookup] = useState<ClientLookup | null>(
    null
  )
  const [lookupState, setLookupState] = useState<
    'idle' | 'searching' | 'not-found' | 'found'
  >('idle')

  const [quote, setQuote] = useState<CalcResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const nav = useNavigate()

  const codeUpper = code.trim().toUpperCase()

  useEffect(() => {
    if (!codeUpper || !warehouseId) {
      setLookup(null)
      setLookupState('idle')
      return
    }
    let cancelled = false
    setLookupState('searching')
    const t = window.setTimeout(async () => {
      try {
        const res = await api<ClientLookup | null>(
          `/warehouses/${warehouseId}/clients/lookup` +
            `?code=${encodeURIComponent(codeUpper)}`
        )
        if (cancelled) return
        if (res) {
          setLookup(res)
          setLookupState('found')
          setAcceptWithout(false)
        } else {
          setLookup(null)
          setLookupState('not-found')
        }
      } catch {
        if (!cancelled) setLookupState('idle')
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [codeUpper, warehouseId])

  useEffect(() => {
    if (!warehouseId) return
    const w = Number(weight)
    const v = Number(volume)
    if (!(w > 0 && v > 0)) {
      setQuote(null)
      return
    }
    let cancelled = false
    const t = window.setTimeout(async () => {
      try {
        const q = await api<CalcResponse>('/calc/quote', {
          method: 'POST',
          auth: false,
          body: {
            warehouse_id: warehouseId,
            weight_kg: w,
            volume_m3: v,
          },
        })
        if (!cancelled) setQuote(q)
      } catch {
        if (!cancelled) setQuote(null)
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [weight, volume, warehouseId])

  const canSubmit = useMemo(() => {
    if (!warehouseId) return false
    if (!(Number(weight) > 0 && Number(volume) > 0)) return false
    if (lookupState === 'found') return true
    if (!codeUpper && acceptWithout) return true
    if (
      codeUpper && lookupState === 'not-found' && acceptWithout
    ) return true
    return false
  }, [
    warehouseId, weight, volume, lookupState, codeUpper,
    acceptWithout,
  ])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!warehouseId || !canSubmit) return
    setSaving(true)
    try {
      const res = await api<GoodsReceiveResponse>(
        `/warehouses/${warehouseId}/goods`,
        {
          method: 'POST',
          body: {
            client_code: codeUpper || null,
            description: description || null,
            weight_kg: Number(weight),
            volume_m3: Number(volume),
            accept_without_client: acceptWithout,
          },
        }
      )
      const suffix = res.is_unclaimed
        ? ' (без клиента)'
        : res.notified
          ? ' Клиенту отправлено уведомление.'
          : ''
      toast.push({
        kind: 'ok',
        text: `Товар #${res.id} принят${suffix}`,
      })
      setCode('')
      setDescription('')
      setVolume('')
      setWeight('')
      setAcceptWithout(false)
      setLookup(null)
      setLookupState('idle')
      setQuote(null)
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message :
          e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setSaving(false)
    }
  }

  const showOwnerPicker =
    me.role === 'owner' && warehouses.length > 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Приёмка
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Один товар — одна запись. Плотность и стоимость
          считаются автоматически из тарифа склада.
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="grid gap-5">
          {showOwnerPicker && (
            <div>
              <div className="mb-1 text-sm text-ink-secondary
                font-medium">
                Склад
              </div>
              <div className="flex gap-2 flex-wrap">
                {warehouses.map((w) => (
                  <button
                    type="button"
                    key={w.id}
                    onClick={() => setWarehouseId(w.id)}
                    className={
                      w.id === warehouseId
                        ? 'rounded-md bg-accent-tint ' +
                            'text-accent-strong ' +
                            'font-medium px-3 py-1.5 text-sm'
                        : 'rounded-md border border-line ' +
                            'text-ink-secondary hover:bg-hover ' +
                            'px-3 py-1.5 text-sm'
                    }
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Input
            label="Код клиента"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="LQ-007"
            autoFocus
            autoComplete="off"
            hint={
              lookupState === 'searching'
                ? 'Ищем клиента…'
                : lookupState === 'not-found'
                  ? undefined
                  : lookupState === 'found' && lookup
                    ? `${lookup.full_name} · ${lookup.phone}`
                    : 'Оставьте пустым и включите «без клиента»'
            }
          />

          {lookupState === 'found' && lookup && (
            <div className="flex flex-wrap items-center gap-2
              text-sm">
              <Pill variant="ok">клиент найден</Pill>
              <span className="text-ink-secondary">
                {lookup.full_name} · {lookup.phone}
              </span>
              <span className="text-ink-muted">
                {lookup.telegram_status === 'verified'
                  ? '· Telegram привязан'
                  : '· Telegram не привязан, уведомления не уйдут'}
              </span>
            </div>
          )}

          {lookupState === 'not-found' && (
            <div className="flex items-start gap-2 rounded-md
              border-l-4 border-warn bg-warn-tint/40 p-3
              text-sm">
              <Pill variant="warn" showDot={false}>
                код не найден
              </Pill>
              <div className="flex-1">
                <div className="text-ink-primary">
                  Клиента с кодом {codeUpper} нет в базе.
                </div>
                <label className="mt-2 flex items-center gap-2
                  text-sm">
                  <input
                    type="checkbox"
                    checked={acceptWithout}
                    onChange={(e) =>
                      setAcceptWithout(e.target.checked)
                    }
                  />
                  Всё равно принять как «без клиента»
                </label>
              </div>
            </div>
          )}

          {!codeUpper && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptWithout}
                onChange={(e) =>
                  setAcceptWithout(e.target.checked)
                }
              />
              Принять без кода (пометить «без клиента»)
            </label>
          )}

          <Input
            label="Описание"
            optional
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Посуда, ткань, обувь…"
          />

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          {quote && (
            <div className="rounded-md border border-line
              bg-elev p-4 grid gap-2 sm:grid-cols-3
              text-sm">
              <Row label="Плотность"
                value={fmtDensity(quote.density_kg_m3)} />
              <Row label="Ставка"
                value={
                  quote.mode === 'per_m3' &&
                  quote.rate_usd_per_m3 != null
                    ? `${fmtUsd(quote.rate_usd_per_m3)}/м³`
                    : `${fmtUsd(quote.rate_usd_per_kg)}/кг`
                } />
              <Row
                label="Фрахт"
                value={fmtSomoni(quote.freight_somoni)}
                hint={fmtUsd(quote.freight_usd)}
              />
            </div>
          )}

          <div className="flex items-center justify-between
            border-t border-line-hair pt-4">
            <button
              type="button"
              onClick={() => nav('/staff')}
              className="text-sm text-ink-secondary
                hover:text-accent"
            >
              ← Отменить и вернуться
            </button>
            <Button
              type="submit"
              disabled={!canSubmit}
              loading={saving}
            >
              Принять товар
            </Button>
          </div>
        </form>
      </Card>

      {(weight || volume) && !quote && (
        <div className="text-xs text-ink-muted">
          Заполните обе цифры (вес и объём) — покажем
          мгновенный расчёт.
        </div>
      )}
    </div>
  )
}

function Row({
  label, value, hint,
}: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="label-caps">{label}</div>
      <div className="font-mono-nums text-lg mt-0.5">
        {value}
      </div>
      {hint && (
        <div className="text-xs text-ink-muted">{hint}</div>
      )}
    </div>
  )
}
