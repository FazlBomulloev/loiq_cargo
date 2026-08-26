import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/ui/Card'
import { Button } from '@/ui/Button'
import { Pill } from '@/ui/Pill'
import { EmptyState } from '@/ui/EmptyState'
import { api, ApiError } from '@/lib/api'
import {
  ReceiveResponse, WaybillDetail as Detail,
} from '@/lib/types'
import {
  fmtDate, fmtDensity, fmtKg, fmtM3, fmtUsd,
} from '@/lib/format'
import { useToast } from '@/ui/Toast'
import { cx } from '@/ui/utils'

export function StaffWaybillDetail() {
  const { id } = useParams<{ id: string }>()
  const shipmentId = Number(id)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const toast = useToast()
  const nav = useNavigate()

  useEffect(() => {
    if (!shipmentId) return
    let cancelled = false
    setLoading(true)
    api<Detail>(`/dushanbe/waybills/${shipmentId}`)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        const alreadyReceived = new Set(
          d.goods
            .filter((g) => g.status === 'in_dushanbe' ||
              g.status === 'delivered')
            .map((g) => g.id)
        )
        setChecked(alreadyReceived)
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
  }, [shipmentId])

  const alreadyArrived = detail?.status === 'arrived'

  function toggle(gid: number) {
    if (alreadyArrived) return
    const next = new Set(checked)
    if (next.has(gid)) next.delete(gid)
    else next.add(gid)
    setChecked(next)
  }

  function toggleAll(select: boolean) {
    if (!detail || alreadyArrived) return
    if (select) {
      setChecked(new Set(detail.goods.map((g) => g.id)))
    } else {
      setChecked(new Set())
    }
  }

  async function onConfirm() {
    if (!detail) return
    setConfirming(true)
    try {
      const res = await api<ReceiveResponse>(
        `/dushanbe/waybills/${shipmentId}/receive`,
        {
          method: 'POST',
          body: { received_ids: Array.from(checked) },
        }
      )
      const suffix = res.missing_count > 0
        ? `, ${res.missing_count} недостача`
        : ''
      toast.push({
        kind: 'ok',
        text: `Принято ${res.received_count} из ${
          detail.goods.length}${suffix}`,
      })
      nav('/staff/waybills')
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setConfirming(false)
    }
  }

  const receivedCount = useMemo(() => checked.size, [checked])
  const missingCount = detail
    ? detail.goods.length - receivedCount
    : 0

  if (loading) {
    return (
      <div className="text-sm text-ink-muted">Загружаем…</div>
    )
  }

  if (!detail) {
    return (
      <EmptyState
        title="Накладная не найдена"
        hint="Возможно, партия уже удалена или ещё не отправлена."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => nav('/staff/waybills')}
            className="text-sm text-ink-secondary
              hover:text-accent"
          >
            ← К списку накладных
          </button>
          <h1 className="font-serif text-2xl font-semibold mt-1">
            Накладная {detail.number}
          </h1>
          <div className="text-sm text-ink-muted mt-1">
            {detail.warehouse_name}
            {detail.departed_at && (
              <> · отправлена {fmtDate(detail.departed_at)}
              </>
            )}
            {alreadyArrived && detail.arrived_at && (
              <> · принята {fmtDate(detail.arrived_at)}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {alreadyArrived ? (
            <Pill variant="ok">партия принята</Pill>
          ) : (
            <>
              <div className="text-sm text-ink-secondary">
                отметили{' '}
                <span className="font-mono-nums text-ink-primary">
                  {receivedCount} / {detail.goods.length}
                </span>
                {missingCount > 0 && (
                  <span className="text-crit ml-2">
                    · {missingCount} недостача
                  </span>
                )}
              </div>
              <Button
                onClick={onConfirm}
                disabled={detail.goods.length === 0}
                loading={confirming}
              >
                Принять партию
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Товаров"
          value={`${detail.goods.length} шт`} />
        <Metric label="Вес" value={fmtKg(detail.total_weight_kg)} />
        <Metric label="Объём" value={fmtM3(detail.total_volume_m3)} />
        <Metric label="Стоимость"
          value={fmtUsd(detail.total_cost_usd)} />
      </div>

      {!alreadyArrived && (
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => toggleAll(true)}
            className="text-accent hover:text-accent-strong"
          >
            Отметить все
          </button>
          <span className="text-line">·</span>
          <button
            onClick={() => toggleAll(false)}
            className="text-ink-secondary hover:text-accent"
          >
            Снять отметки
          </button>
        </div>
      )}

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="label-caps px-4 py-2 w-10"></th>
                <th className="label-caps px-4 py-2 text-left">
                  Код
                </th>
                <th className="label-caps px-4 py-2 text-left">
                  Товар
                </th>
                <th className="label-caps px-4 py-2 text-right">
                  Вес
                </th>
                <th className="label-caps px-4 py-2 text-right">
                  Объём
                </th>
                <th className="label-caps px-4 py-2 text-right">
                  Плотн.
                </th>
                <th className="label-caps px-4 py-2 text-right">
                  Принят
                </th>
                <th className="label-caps px-4 py-2 text-left">
                  Статус
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.goods.map((g) => {
                const isChecked = checked.has(g.id)
                return (
                  <tr
                    key={g.id}
                    onClick={() => toggle(g.id)}
                    className={cx(
                      'border-b border-line-hair',
                      !alreadyArrived && 'cursor-pointer',
                      isChecked && 'bg-good-tint/30',
                      !isChecked && !alreadyArrived &&
                        'hover:bg-hover',
                    )}
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(g.id)}
                        disabled={alreadyArrived}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 accent-accent"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span className={
                        g.client_code
                          ? 'text-accent-strong'
                          : 'text-warn'
                      }>
                        {g.client_code || 'без клиента'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {g.description || (
                        <span className="text-ink-muted italic">
                          без описания
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right
                      font-mono-nums">
                      {fmtKg(g.weight_kg)}
                    </td>
                    <td className="px-4 py-2 text-right
                      font-mono-nums">
                      {fmtM3(g.volume_m3)}
                    </td>
                    <td className="px-4 py-2 text-right
                      font-mono-nums">
                      {fmtDensity(g.density_kg_m3)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {fmtDate(g.received_at)}
                    </td>
                    <td className="px-4 py-2">
                      {g.status === 'in_dushanbe' && (
                        <Pill variant="ok">в Душанбе</Pill>
                      )}
                      {g.status === 'delivered' && (
                        <Pill variant="info">выдан</Pill>
                      )}
                      {g.status === 'in_transit' &&
                        !isChecked && !alreadyArrived && (
                          <Pill variant="warn">будет недост.</Pill>
                        )}
                      {g.status === 'in_transit' &&
                        alreadyArrived && g.is_missing && (
                          <Pill variant="crit">недостача</Pill>
                        )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Metric({
  label, value,
}: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-card p-3">
      <div className="label-caps">{label}</div>
      <div className="font-mono-nums text-lg mt-0.5">{value}</div>
    </div>
  )
}
