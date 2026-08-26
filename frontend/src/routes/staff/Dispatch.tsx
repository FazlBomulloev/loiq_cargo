import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { EmptyState } from '@/ui/EmptyState'
import { api, ApiError } from '@/lib/api'
import {
  DensityGroup, PlanGoodsRow, PlanReason, PlanResponse,
  ShipmentDetail, StaffMe, Warehouse,
} from '@/lib/types'
import {
  fmtDate, fmtDecimal, fmtDensity, fmtKg, fmtM3, fmtUsd,
} from '@/lib/format'
import { useToast } from '@/ui/Toast'
import { cx } from '@/ui/utils'

interface Props {
  me: StaffMe
  activeWarehouse: Warehouse | null
  warehouses: Warehouse[]
}

const REASON_LABEL: Record<PlanReason, string> = {
  burning: 'горит',
  quota: 'квота',
  topup: 'добор',
  manual: 'вручную',
  excluded: 'исключён',
}

const REASON_VARIANT: Record<
  PlanReason, 'crit' | 'route' | 'neutral' | 'info' | 'warn'
> = {
  burning: 'crit',
  quota: 'route',
  topup: 'neutral',
  manual: 'info',
  excluded: 'warn',
}

const GROUP_LABEL: Record<DensityGroup, string> = {
  dense: 'плотный (≥250)',
  medium: 'средний (100–249)',
  light: 'лёгкий (<100)',
}

export function StaffDispatch({
  me, activeWarehouse, warehouses,
}: Props) {
  const [warehouseId, setWarehouseId] = useState<number | null>(
    activeWarehouse?.id ?? warehouses[0]?.id ?? null
  )
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoBuiltFor, setAutoBuiltFor] = useState<number | null>(
    null
  )
  const [truckVolume, setTruckVolume] = useState('')
  const [truckWeight, setTruckWeight] = useState('')
  const [note, setNote] = useState('')
  const [manualIds, setManualIds] = useState<Set<number> | null>(
    null
  )
  const toast = useToast()
  const nav = useNavigate()

  useEffect(() => {
    if (!warehouseId) return
    if (autoBuiltFor === warehouseId) return
    setAutoBuiltFor(warehouseId)
    void rebuild(null)
  }, [warehouseId])

  async function rebuild(ids: number[] | null) {
    if (!warehouseId) return
    setLoading(true)
    try {
      const body: Record<string, unknown> = {}
      if (truckVolume) body.truck_volume_m3 = Number(truckVolume)
      if (truckWeight) body.truck_weight_kg = Number(truckWeight)
      if (ids !== null) body.include_ids = ids
      const res = await api<PlanResponse>(
        `/warehouses/${warehouseId}/shipments/plan`,
        { method: 'POST', body },
      )
      setPlan(res)
      if (ids === null) {
        setManualIds(null)
      } else {
        setManualIds(new Set(res.selected.map((r) => r.id)))
      }
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message :
          e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setLoading(false)
    }
  }

  async function onAutoBuild() {
    await rebuild(null)
  }

  async function onRecalc(ids: number[]) {
    await rebuild(ids)
  }

  function toggleGood(id: number, selected: boolean) {
    const base = new Set(
      manualIds ??
        (plan ? plan.selected.map((r) => r.id) : [])
    )
    if (selected) base.delete(id)
    else base.add(id)
    setManualIds(base)
    void onRecalc(Array.from(base))
  }

  async function onConfirm() {
    if (!plan || !warehouseId) return
    const ids = plan.selected.map((r) => r.id)
    if (ids.length === 0) {
      toast.push({
        kind: 'warn', text: 'Партия пуста — нечего отправлять',
      })
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = { goods_ids: ids }
      if (truckVolume) body.truck_volume_m3 = Number(truckVolume)
      if (truckWeight) body.truck_weight_kg = Number(truckWeight)
      if (note.trim()) body.note = note.trim()
      const res = await api<ShipmentDetail>(
        `/warehouses/${warehouseId}/shipments`,
        { method: 'POST', body },
      )
      toast.push({
        kind: 'ok',
        text: `Партия ${res.number} отправлена (${
          res.goods.length} тов., ${fmtUsd(res.total_cost_usd)})`,
      })
      nav('/staff/shipments')
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

  const readyBadge = useMemo(() => {
    if (!plan) return null
    return plan.is_ready ? (
      <Pill variant="ok">готов к отправке</Pill>
    ) : (
      <Pill variant="warn">есть недобор</Pill>
    )
  }, [plan])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">
            Отправка
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Оптимизатор набирает фуру: горящие первыми, потом
            квоты по плотности и добор. Правьте вручную —
            цифры пересчитаются.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {readyBadge}
          <Button
            onClick={onConfirm}
            disabled={!plan || plan.selected.length === 0}
            loading={saving}
          >
            Подтвердить и отправить
          </Button>
        </div>
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

      <Card>
        <div className="grid gap-4 md:grid-cols-4">
          <Input
            label="Объём фуры"
            optional
            numeric
            suffix="м³"
            inputMode="decimal"
            value={truckVolume}
            onChange={(e) => setTruckVolume(e.target.value)}
            placeholder={plan ? plan.truck_volume_m3 : ''}
            hint="дефолт склада, можно переопределить"
          />
          <Input
            label="Грузоподъёмность"
            optional
            numeric
            suffix="кг"
            inputMode="decimal"
            value={truckWeight}
            onChange={(e) => setTruckWeight(e.target.value)}
            placeholder={plan ? plan.truck_weight_kg : ''}
          />
          <Input
            label="Комментарий"
            optional
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="напр. Водитель Ахмед"
          />
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={onAutoBuild}
              loading={loading}
              className="w-full"
            >
              Пересобрать автоматически
            </Button>
          </div>
        </div>
      </Card>

      {loading && !plan ? (
        <div className="text-sm text-ink-muted">Считаем…</div>
      ) : plan == null ? (
        <EmptyState
          title="Нет плана"
          hint="Выберите склад — оптимизатор соберёт фуру."
        />
      ) : plan.selected.length === 0 &&
        plan.left_behind.length === 0 ? (
        <EmptyState
          title="Готовых к отправке товаров нет"
          hint="Оформите приёмки или дождитесь новых поступлений."
        />
      ) : (
        <>
          <Card padded={false}>
            <div className="grid gap-3 sm:grid-cols-4 p-4">
              <Metric
                label="Заполненность"
                value={`${fmtDecimal(plan.fill_pct, 0)} %`}
                sub={`порог ${plan.fill_target_pct}%`}
                gate={plan.gate_fill.ok}
              />
              <Metric
                label="Стоимость"
                value={fmtUsd(plan.total_cost_usd)}
                sub={`цель ${fmtUsd(plan.target_cost_usd)}`}
                gate={plan.gate_cost.ok}
              />
              <Metric
                label="Вес"
                value={fmtKg(plan.total_weight_kg)}
                sub={`лимит ${fmtKg(plan.truck_weight_kg)}`}
                gate={plan.gate_weight.ok}
              />
              <Metric
                label="Объём"
                value={fmtM3(plan.total_volume_m3)}
                sub={`фура ${fmtM3(plan.truck_volume_m3)}`}
                gate={true}
              />
            </div>
            <div className="border-t border-line-hair
              grid gap-3 sm:grid-cols-3 p-4">
              {(['dense', 'medium', 'light'] as DensityGroup[])
                .map((g) => {
                  const s = plan.groups[g]
                  const overshoot =
                    Number(s.volume_m3) > Number(s.quota_m3)
                  return (
                    <div key={g} className="text-sm">
                      <div className="label-caps">
                        {GROUP_LABEL[g]}
                      </div>
                      <div className="mt-1 font-mono-nums">
                        <span
                          className={cx(
                            overshoot && 'text-warn',
                          )}
                        >
                          {fmtM3(s.volume_m3)}
                        </span>
                        <span className="text-ink-muted">
                          {' / '}{fmtM3(s.quota_m3)}
                        </span>
                        <span className="text-ink-muted ml-2">
                          {s.count} тов.
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </Card>

          <div className="space-y-2">
            <h2 className="font-serif text-lg font-semibold">
              В партию · {plan.selected.length}
            </h2>
            <GoodsList
              rows={plan.selected}
              selectable
              selected
              onToggle={(id) => toggleGood(id, true)}
              emptyText="Пока никого не выбрано."
            />
          </div>

          {plan.left_behind.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-serif text-lg font-semibold
                text-ink-secondary">
                Останется на складе · {plan.left_behind.length}
              </h2>
              <GoodsList
                rows={plan.left_behind}
                selectable
                selected={false}
                onToggle={(id) => toggleGood(id, false)}
                emptyText="—"
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Metric({
  label, value, sub, gate,
}: {
  label: string
  value: string
  sub: string
  gate: boolean
}) {
  return (
    <div>
      <div className="label-caps">{label}</div>
      <div className={cx(
        'mt-0.5 font-mono-nums text-2xl',
        gate ? 'text-ink-primary' : 'text-warn',
      )}>
        {value}
      </div>
      <div className="text-xs text-ink-muted">{sub}</div>
    </div>
  )
}

function GoodsList({
  rows, selectable, selected, onToggle, emptyText,
}: {
  rows: PlanGoodsRow[]
  selectable: boolean
  selected: boolean
  onToggle: (id: number) => void
  emptyText: string
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <div className="text-sm text-ink-muted">{emptyText}</div>
      </Card>
    )
  }
  return (
    <Card padded={false}>
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
            cell: (r) => fmtUsd(r.freight_usd),
          },
          {
            key: 'age',
            header: 'Лежит',
            numeric: true,
            align: 'right',
            cell: (r) => (
              <span className={r.is_burning ? 'text-crit' : ''}>
                {r.age_days} д
              </span>
            ),
          },
          {
            key: 'received',
            header: 'Принят',
            align: 'right',
            cell: (r) => fmtDate(r.received_at),
          },
          {
            key: 'reason',
            header: 'Причина',
            cell: (r) => (
              <Pill variant={REASON_VARIANT[r.reason]}>
                {REASON_LABEL[r.reason]}
              </Pill>
            ),
          },
          ...(selectable
            ? [
              {
                key: 'act',
                header: '',
                align: 'right' as const,
                cell: (r: PlanGoodsRow) => (
                  <button
                    onClick={() => onToggle(r.id)}
                    className={cx(
                      'text-sm',
                      selected
                        ? 'text-ink-secondary hover:text-crit'
                        : 'text-accent hover:text-accent-strong',
                    )}
                  >
                    {selected ? 'убрать' : 'добавить'}
                  </button>
                ),
              },
            ]
            : []),
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        density="dense"
      />
    </Card>
  )
}
