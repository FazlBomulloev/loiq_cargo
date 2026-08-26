import { FormEvent, useEffect, useState } from 'react'
import { Card } from '@/ui/Card'
import { Input } from '@/ui/Input'
import { Button } from '@/ui/Button'
import { Pill } from '@/ui/Pill'
import { Table } from '@/ui/Table'
import { EmptyState } from '@/ui/EmptyState'
import { api, ApiError } from '@/lib/api'
import {
  DeliveryConfirmResponse, DeliveryPreview,
} from '@/lib/types'
import {
  fmtDate, fmtDensity, fmtKg, fmtM3, fmtSomoni,
} from '@/lib/format'
import { useToast } from '@/ui/Toast'

export function StaffDelivery() {
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<DeliveryPreview | null>(
    null
  )
  const [state, setState] = useState<
    'idle' | 'searching' | 'not-found' | 'no-goods' | 'ready'
  >('idle')
  const [paid, setPaid] = useState(true)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      setPreview(null)
      setState('idle')
      return
    }
    let cancelled = false
    setState('searching')
    const t = window.setTimeout(async () => {
      try {
        const res = await api<DeliveryPreview>(
          `/dushanbe/delivery/lookup?code=${
            encodeURIComponent(trimmed)}`
        )
        if (cancelled) return
        setPreview(res)
        setState(res.goods.length === 0 ? 'no-goods' : 'ready')
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 404) {
          setPreview(null)
          setState('not-found')
        } else {
          setPreview(null)
          setState('idle')
          const msg =
            e instanceof Error ? e.message : String(e)
          toast.push({ kind: 'crit', text: msg })
        }
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [code])

  async function onConfirm(e: FormEvent) {
    e.preventDefault()
    if (!preview || state !== 'ready') return
    setConfirming(true)
    try {
      const res = await api<DeliveryConfirmResponse>(
        '/dushanbe/delivery',
        {
          method: 'POST',
          body: {
            client_code: preview.client_code,
            paid,
            note: note.trim() || null,
          },
        }
      )
      const paidLabel = res.payment_status === 'paid'
        ? 'оплачено'
        : 'долг'
      toast.push({
        kind: 'ok',
        text: `Выдано ${preview.client_code}: ${
          res.delivered_count} тов., ${fmtSomoni(
          res.total_paid_somoni)} · ${paidLabel}`,
      })
      setCode('')
      setPreview(null)
      setState('idle')
      setNote('')
      setPaid(true)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Выдача
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Полная выдача: клиент забирает все товары со статусом
          «в Душанбе» разом. Введите код клиента.
        </p>
      </div>

      <Card>
        <div className="max-w-md">
          <Input
            label="Код клиента"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="LQ-007"
            autoFocus
            autoComplete="off"
            hint={
              state === 'searching' ? 'Ищем клиента…' :
                state === 'not-found'
                  ? undefined
                  : 'Оптимизатор найдёт все товары в Душанбе'
            }
          />
          {state === 'not-found' && (
            <div className="mt-2">
              <Pill variant="warn">клиент не найден</Pill>
            </div>
          )}
        </div>
      </Card>

      {state === 'no-goods' && preview && (
        <EmptyState
          title={
            `У клиента ${preview.client_code} нет товаров ` +
            'к выдаче'
          }
          hint={
            'Товары должны иметь статус «в Душанбе». ' +
            'Проверьте накладные.'
          }
        />
      )}

      {state === 'ready' && preview && (
        <form onSubmit={onConfirm} className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-baseline
              justify-between gap-4">
              <div>
                <div className="label-caps">Клиент</div>
                <div className="font-serif text-xl mt-0.5">
                  {preview.client_full_name}
                </div>
                <div className="text-sm text-ink-muted mt-1">
                  {preview.client_code} · {preview.phone}
                  {preview.telegram_verified ? (
                    <span className="ml-2 text-good">
                      · Telegram привязан
                    </span>
                  ) : (
                    <span className="ml-2 text-warn">
                      · Telegram не привязан
                    </span>
                  )}
                </div>
              </div>
              <Pill variant="info">
                {preview.goods.length} товаров к выдаче
              </Pill>
            </div>
          </Card>

          <Card padded={false}>
            <Table
              columns={[
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
                  key: 'density',
                  header: 'Плотн.',
                  numeric: true,
                  align: 'right',
                  cell: (r) => fmtDensity(r.density_kg_m3),
                },
                {
                  key: 'freight',
                  header: 'Фрахт',
                  numeric: true,
                  align: 'right',
                  cell: (r) => fmtSomoni(r.freight_somoni),
                },
                {
                  key: 'storage',
                  header: 'Простой',
                  numeric: true,
                  align: 'right',
                  cell: (r) => (
                    <span>
                      {r.storage_paid_days > 0 ? (
                        <span className="text-warn">
                          {fmtSomoni(r.storage_fee_somoni)}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                      <span className="text-xs
                        text-ink-muted ml-2">
                        {r.storage_days} д
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'arrived',
                  header: 'Прибыл',
                  align: 'right',
                  cell: (r) => fmtDate(r.arrived_in_dushanbe_at),
                },
              ]}
              rows={preview.goods}
              rowKey={(r) => r.id}
              density="dense"
            />
          </Card>

          <Card>
            <div className="grid gap-4 md:grid-cols-3">
              <PayRow
                label="Фрахт"
                value={fmtSomoni(preview.total_freight_somoni)}
              />
              <PayRow
                label="Простой"
                value={fmtSomoni(preview.total_storage_somoni)}
                hint={
                  `${preview.free_storage_days} дней бесплатно, ` +
                  `далее ${fmtSomoni(
                    preview.storage_daily_coef_somoni
                  )} / день`
                }
              />
              <PayRow
                label="К оплате"
                value={fmtSomoni(preview.total_to_pay_somoni)}
                strong
              />
            </div>
            <div className="border-t border-line-hair mt-4
              pt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 label-caps">Оплата</div>
                <div className="flex gap-2">
                  <PayChoice
                    active={paid}
                    onClick={() => setPaid(true)}
                    label="Оплачено"
                    tone="good"
                  />
                  <PayChoice
                    active={!paid}
                    onClick={() => setPaid(false)}
                    label="В долг"
                    tone="warn"
                  />
                </div>
              </div>
              <Input
                label="Комментарий"
                optional
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="напр. документы не забрал"
              />
            </div>
            <div className="border-t border-line-hair mt-4
              pt-4 flex justify-end">
              <Button
                type="submit"
                loading={confirming}
              >
                Выдать · {fmtSomoni(
                  preview.total_to_pay_somoni
                )}
              </Button>
            </div>
          </Card>
        </form>
      )}
    </div>
  )
}

function PayRow({
  label, value, hint, strong,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
}) {
  return (
    <div>
      <div className="label-caps">{label}</div>
      <div className={
        strong
          ? 'font-mono-nums text-2xl mt-1 text-accent-strong'
          : 'font-mono-nums text-lg mt-1 text-ink-primary'
      }>
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

function PayChoice({
  active, onClick, label, tone,
}: {
  active: boolean
  onClick: () => void
  label: string
  tone: 'good' | 'warn'
}) {
  const activeCls =
    tone === 'good'
      ? 'bg-good-tint text-good border-good'
      : 'bg-warn-tint text-warn border-warn'
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? `rounded-md border px-4 py-2 text-sm font-medium ${
            activeCls}`
          : 'rounded-md border border-line text-ink-secondary ' +
            'hover:bg-hover px-4 py-2 text-sm'
      }
    >
      {label}
    </button>
  )
}
