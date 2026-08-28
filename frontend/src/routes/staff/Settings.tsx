import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { Input } from '@/ui/Input'
import { api, ApiError } from '@/lib/api'
import {
  SettingsResponse, StaffMe, Warehouse,
} from '@/lib/types'
import { useToast } from '@/ui/Toast'

interface Props {
  me: StaffMe
  warehouses: Warehouse[]
}

const LABEL: Record<string, string> = {
  burning_days_threshold: 'Дней до пометки «горящий»',
  fill_target_pct: 'Порог заполненности фуры, %',
  target_cost_usd: 'Целевая стоимость фуры, $',
  density_quota_dense_pct: 'Квота плотного груза (≥250), %',
  density_quota_medium_pct: 'Квота среднего (100–249), %',
  density_quota_light_pct: 'Квота лёгкого (<100), %',
  free_storage_days: 'Дней бесплатного хранения',
  storage_daily_coef_somoni: 'Стоимость дня простоя, сомони',
  exchange_rate_somoni_per_usd: 'Курс: 1 USD = X сомони',
}

const GROUPS: { title: string; keys: string[] }[] = [
  {
    title: 'Оптимизатор отправки',
    keys: [
      'burning_days_threshold',
      'fill_target_pct',
      'target_cost_usd',
      'density_quota_dense_pct',
      'density_quota_medium_pct',
      'density_quota_light_pct',
    ],
  },
  {
    title: 'Простой и оплата',
    keys: [
      'free_storage_days',
      'storage_daily_coef_somoni',
      'exchange_rate_somoni_per_usd',
    ],
  },
]

export function StaffSettings({ me, warehouses }: Props) {
  const isOwner = me.role === 'owner'
  const [tab, setTab] = useState<'global' | 'warehouses'>(
    'global'
  )
  const [data, setData] = useState<SettingsResponse | null>(null)
  const [values, setValues] = useState<Record<string, string>>(
    {}
  )
  const [saving, setSaving] = useState(false)
  const [whList, setWhList] = useState<Warehouse[]>(warehouses)
  const [whForm, setWhForm] = useState<Record<
    number, {
      name: string
      truck_volume_m3: string
      truck_weight_kg: string
      multiplier: string
      address: string
    }
  >>({})
  const [whSaving, setWhSaving] = useState<number | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    api<SettingsResponse>('/settings')
      .then((r) => {
        if (cancelled) return
        setData(r)
        const v: Record<string, string> = {}
        for (const it of r.items) {
          v[it.key] = String(it.value)
        }
        setValues(v)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        toast.push({ kind: 'crit', text: msg })
      })
    return () => {
      cancelled = true
    }
  }, [isOwner])

  useEffect(() => {
    setWhList(warehouses)
    const form: Record<
      number,
      {
        name: string
        truck_volume_m3: string
        truck_weight_kg: string
        multiplier: string
        address: string
      }
    > = {}
    for (const w of warehouses) {
      form[w.id] = {
        name: w.name,
        truck_volume_m3: w.truck_volume_m3,
        truck_weight_kg: w.truck_weight_kg,
        multiplier: w.multiplier,
        address: w.address ?? '',
      }
    }
    setWhForm(form)
  }, [warehouses])

  const dirtyKeys = useMemo(() => {
    if (!data) return new Set<string>()
    const s = new Set<string>()
    for (const it of data.items) {
      if (values[it.key] !== String(it.value)) s.add(it.key)
    }
    return s
  }, [data, values])

  async function saveGlobal() {
    if (!data || dirtyKeys.size === 0) return
    setSaving(true)
    try {
      const patch: Record<string, number> = {}
      for (const k of dirtyKeys) {
        const raw = values[k]
        const n = Number(raw)
        if (!Number.isFinite(n)) {
          toast.push({
            kind: 'crit',
            text: `${LABEL[k] ?? k}: некорректное число`,
          })
          setSaving(false)
          return
        }
        patch[k] = n
      }
      const res = await api<SettingsResponse>('/settings', {
        method: 'PATCH',
        body: { values: patch },
      })
      setData(res)
      const v: Record<string, string> = {}
      for (const it of res.items) {
        v[it.key] = String(it.value)
      }
      setValues(v)
      toast.push({
        kind: 'ok',
        text: `Обновлено ${dirtyKeys.size} настроек`,
      })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setSaving(false)
    }
  }

  async function saveWarehouse(w: Warehouse) {
    const form = whForm[w.id]
    if (!form) return
    const payload: Record<string, unknown> = {}
    if (form.name !== w.name) payload.name = form.name
    if (form.truck_volume_m3 !== w.truck_volume_m3) {
      payload.truck_volume_m3 = Number(form.truck_volume_m3)
    }
    if (form.truck_weight_kg !== w.truck_weight_kg) {
      payload.truck_weight_kg = Number(form.truck_weight_kg)
    }
    if (form.multiplier !== w.multiplier) {
      payload.multiplier = Number(form.multiplier)
    }
    if ((form.address ?? '') !== (w.address ?? '')) {
      payload.address = form.address
    }
    if (Object.keys(payload).length === 0) {
      toast.push({
        kind: 'info', text: 'Ничего не изменилось',
      })
      return
    }
    setWhSaving(w.id)
    try {
      const updated = await api<Warehouse>(
        `/settings/warehouses/${w.id}`,
        { method: 'PUT', body: payload }
      )
      setWhList((xs) =>
        xs.map((x) => (x.id === updated.id ? updated : x))
      )
      setWhForm((prev) => ({
        ...prev,
        [w.id]: {
          name: updated.name,
          truck_volume_m3: updated.truck_volume_m3,
          truck_weight_kg: updated.truck_weight_kg,
          multiplier: updated.multiplier,
          address: updated.address ?? '',
        },
      }))
      toast.push({
        kind: 'ok',
        text: `Склад ${updated.name} сохранён`,
      })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setWhSaving(null)
    }
  }

  if (!isOwner) {
    return (
      <EmptyState
        title="Только для овнера"
        hint="Настройки системы доступны только владельцу."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Настройки
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Ключи логики (оптимизатор, простой, курс) и параметры
          складов.
        </p>
      </div>

      <div className="flex gap-2">
        <Chip
          active={tab === 'global'}
          onClick={() => setTab('global')}
        >
          Глобальные
        </Chip>
        <Chip
          active={tab === 'warehouses'}
          onClick={() => setTab('warehouses')}
        >
          Склады
        </Chip>
      </div>

      {tab === 'global' && (
        <div className="space-y-4">
          {!data ? (
            <div className="text-sm text-ink-muted">
              Загружаем…
            </div>
          ) : (
            <>
              {GROUPS.map((g) => (
                <Card key={g.title} title={g.title}>
                  <div className="grid gap-4 sm:grid-cols-2
                    md:grid-cols-3">
                    {g.keys.map((k) => {
                      const item = data.items.find(
                        (i) => i.key === k
                      )
                      if (!item) return null
                      const dirty = dirtyKeys.has(k)
                      return (
                        <div key={k}>
                          <Input
                            label={LABEL[k] ?? k}
                            numeric
                            inputMode="decimal"
                            value={values[k] ?? ''}
                            onChange={(e) =>
                              setValues((v) => ({
                                ...v, [k]: e.target.value,
                              }))
                            }
                            hint={
                              dirty
                                ? `будет ${values[k]} ` +
                                  `(было ${item.value})`
                                : item.description ?? undefined
                            }
                          />
                        </div>
                      )
                    })}
                  </div>
                </Card>
              ))}
              <div className="flex flex-wrap items-center
                justify-between gap-3
                border-t border-line-hair pt-4">
                <div className="text-sm text-ink-muted">
                  {dirtyKeys.size > 0
                    ? `Изменено: ${dirtyKeys.size}`
                    : 'Нет изменений'}
                </div>
                <Button
                  onClick={saveGlobal}
                  loading={saving}
                  disabled={dirtyKeys.size === 0}
                >
                  Сохранить настройки
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'warehouses' && (
        <div className="space-y-4">
          {whList.map((w) => {
            const form = whForm[w.id]
            if (!form) return null
            const dirty =
              form.name !== w.name ||
              form.truck_volume_m3 !== w.truck_volume_m3 ||
              form.truck_weight_kg !== w.truck_weight_kg ||
              form.multiplier !== w.multiplier ||
              (form.address ?? '') !== (w.address ?? '')
            return (
              <Card
                key={w.id}
                title={`${w.name} · ${w.code}`}
                actions={
                  <Button
                    onClick={() => saveWarehouse(w)}
                    loading={whSaving === w.id}
                    disabled={!dirty}
                  >
                    Сохранить
                  </Button>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2
                  md:grid-cols-4">
                  <Input
                    label="Название"
                    value={form.name}
                    onChange={(e) =>
                      setWhForm((p) => ({
                        ...p,
                        [w.id]: {
                          ...p[w.id],
                          name: e.target.value,
                        },
                      }))
                    }
                  />
                  <Input
                    label="Объём фуры"
                    numeric
                    inputMode="decimal"
                    suffix="м³"
                    value={form.truck_volume_m3}
                    onChange={(e) =>
                      setWhForm((p) => ({
                        ...p,
                        [w.id]: {
                          ...p[w.id],
                          truck_volume_m3: e.target.value,
                        },
                      }))
                    }
                  />
                  <Input
                    label="Грузоподъёмность"
                    numeric
                    inputMode="decimal"
                    suffix="кг"
                    value={form.truck_weight_kg}
                    onChange={(e) =>
                      setWhForm((p) => ({
                        ...p,
                        [w.id]: {
                          ...p[w.id],
                          truck_weight_kg: e.target.value,
                        },
                      }))
                    }
                  />
                  <Input
                    label="Коэф. расстояния"
                    numeric
                    inputMode="decimal"
                    value={form.multiplier}
                    onChange={(e) =>
                      setWhForm((p) => ({
                        ...p,
                        [w.id]: {
                          ...p[w.id],
                          multiplier: e.target.value,
                        },
                      }))
                    }
                    hint="применяется к тарифной сетке"
                  />
                  <div className="sm:col-span-2 md:col-span-4">
                    <label className="label-caps mb-1 block">
                      Адрес (виден клиентам)
                    </label>
                    <textarea
                      value={form.address}
                      onChange={(e) =>
                        setWhForm((p) => ({
                          ...p,
                          [w.id]: {
                            ...p[w.id],
                            address: e.target.value,
                          },
                        }))
                      }
                      rows={2}
                      placeholder="город, район, улица, дом,
                        ориентир, контакт"
                      className="w-full rounded-md border
                        border-line bg-input px-3 py-2 text-sm
                        focus:outline-none focus:shadow-focus"
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
