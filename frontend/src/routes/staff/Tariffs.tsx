import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Pill } from '@/ui/Pill'
import { EmptyState } from '@/ui/EmptyState'
import { api, ApiError } from '@/lib/api'
import {
  StaffMe, TariffFull, TariffRowIn, Warehouse,
} from '@/lib/types'
import { fmtDateFull } from '@/lib/format'
import { useToast } from '@/ui/Toast'

interface Props {
  me: StaffMe
  warehouses: Warehouse[]
}

type EditorMode = 'per_kg' | 'per_m3'

interface EditorRow {
  density_from: string
  density_to: string
  mode: EditorMode
  rate: string
}

const EMPTY_ROWS: EditorRow[] = [
  { density_from: '1001', density_to: '',    mode: 'per_kg', rate: '0.50' },
  { density_from: '901',  density_to: '1001', mode: 'per_kg', rate: '0.55' },
  { density_from: '801',  density_to: '901',  mode: 'per_kg', rate: '0.60' },
  { density_from: '701',  density_to: '801',  mode: 'per_kg', rate: '0.65' },
  { density_from: '601',  density_to: '701',  mode: 'per_kg', rate: '0.70' },
  { density_from: '501',  density_to: '601',  mode: 'per_kg', rate: '0.75' },
  { density_from: '401',  density_to: '501',  mode: 'per_kg', rate: '0.80' },
  { density_from: '301',  density_to: '401',  mode: 'per_kg', rate: '0.85' },
  { density_from: '251',  density_to: '301',  mode: 'per_kg', rate: '0.90' },
  { density_from: '201',  density_to: '251',  mode: 'per_kg', rate: '0.95' },
  { density_from: '0',    density_to: '201',  mode: 'per_m3', rate: '195.00' },
]

export function StaffTariffs({ me, warehouses }: Props) {
  const [warehouseId, setWarehouseId] = useState<number | null>(
    warehouses[0]?.id ?? null
  )
  const [list, setList] = useState<TariffFull[]>([])
  const [loading, setLoading] = useState(false)
  const [editorId, setEditorId] = useState<
    number | 'new' | null
  >(null)
  const [editorNote, setEditorNote] = useState('')
  const [editorRows, setEditorRows] = useState<EditorRow[]>(
    EMPTY_ROWS
  )
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const isOwner = me.role === 'owner'

  useEffect(() => {
    if (!warehouseId || !isOwner) return
    let cancelled = false
    setLoading(true)
    api<TariffFull[]>(`/warehouses/${warehouseId}/tariffs`)
      .then((r) => {
        if (!cancelled) setList(r)
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
  }, [warehouseId, isOwner])

  const active = useMemo(
    () => list.find((t) => t.is_active) ?? null,
    [list],
  )
  const drafts = useMemo(
    () => list.filter((t) => !t.is_active),
    [list],
  )

  function openEditor(t: TariffFull | 'new') {
    if (t === 'new') {
      setEditorId('new')
      setEditorNote('')
      setEditorRows(EMPTY_ROWS)
    } else {
      setEditorId(t.id)
      setEditorNote(t.note ?? '')
      setEditorRows(
        t.rows.map((r) => {
          const mode: EditorMode =
            r.rate_usd_per_m3 != null ? 'per_m3' : 'per_kg'
          const rate =
            mode === 'per_m3'
              ? String(r.rate_usd_per_m3 ?? '')
              : String(r.rate_usd_per_kg ?? '')
          return {
            density_from: String(r.density_from),
            density_to: r.density_to ?? '',
            mode,
            rate,
          }
        })
      )
    }
  }

  function closeEditor() {
    setEditorId(null)
  }

  function updateRow(
    idx: number, field: keyof EditorRow, value: string,
  ) {
    setEditorRows((rows) =>
      rows.map((r, i) =>
        i === idx ? { ...r, [field]: value } : r
      )
    )
  }

  function addRow() {
    setEditorRows((rows) => [
      ...rows,
      { density_from: '', density_to: '', mode: 'per_kg', rate: '' },
    ])
  }

  function removeRow(idx: number) {
    setEditorRows((rows) => rows.filter((_, i) => i !== idx))
  }

  async function saveDraft() {
    if (!warehouseId) return
    const parsed: TariffRowIn[] = []
    for (const r of editorRows) {
      const df = Number(r.density_from)
      const dt = r.density_to === '' ? null : Number(r.density_to)
      const rate = Number(r.rate)
      if (!Number.isFinite(df) || df < 0) {
        toast.push({
          kind: 'crit',
          text: 'плотность «от» должна быть числом ≥ 0',
        })
        return
      }
      if (dt != null && !Number.isFinite(dt)) {
        toast.push({
          kind: 'crit',
          text: 'плотность «до» должна быть числом или пустой',
        })
        return
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.push({
          kind: 'crit',
          text: 'ставка должна быть больше нуля',
        })
        return
      }
      parsed.push({
        density_from: df,
        density_to: dt,
        rate_usd_per_kg: r.mode === 'per_kg' ? rate : null,
        rate_usd_per_m3: r.mode === 'per_m3' ? rate : null,
      })
    }
    setSaving(true)
    try {
      if (editorId === 'new') {
        const created = await api<TariffFull>(
          `/warehouses/${warehouseId}/tariffs`,
          {
            method: 'POST',
            body: {
              note: editorNote || null,
              rows: parsed,
            },
          }
        )
        setList((xs) => [created, ...xs])
        toast.push({
          kind: 'ok',
          text: `Черновик тарифа #${created.id} сохранён`,
        })
      } else if (typeof editorId === 'number') {
        const updated = await api<TariffFull>(
          `/tariffs/${editorId}`,
          {
            method: 'PUT',
            body: {
              note: editorNote || null,
              rows: parsed,
            },
          }
        )
        setList((xs) =>
          xs.map((t) => (t.id === updated.id ? updated : t))
        )
        toast.push({
          kind: 'ok',
          text: `Тариф #${updated.id} обновлён`,
        })
      }
      setEditorId(null)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setSaving(false)
    }
  }

  async function activate(id: number) {
    try {
      const activated = await api<TariffFull>(
        `/tariffs/${id}/activate`,
        { method: 'POST', body: {} }
      )
      setList((xs) =>
        xs.map((t) => ({
          ...t,
          is_active: t.id === activated.id,
        }))
      )
      toast.push({
        kind: 'ok',
        text: `Тариф #${activated.id} активирован`,
      })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    }
  }

  async function drop(id: number) {
    try {
      await api<void>(`/tariffs/${id}`, { method: 'DELETE' })
      setList((xs) => xs.filter((t) => t.id !== id))
      toast.push({
        kind: 'ok', text: `Тариф #${id} удалён`,
      })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    }
  }

  if (!isOwner) {
    return (
      <EmptyState
        title="Только для овнера"
        hint="Настройка тарифов доступна только владельцу карго."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between
        gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">
            Тарифы
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Плотностная сетка по каждому складу. Активная
            версия применяется ко всем новым приёмкам.
          </p>
        </div>
        {editorId === null && (
          <Button onClick={() => openEditor('new')}>
            + Новая версия
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {warehouses.map((w) => (
          <Chip
            key={w.id}
            active={w.id === warehouseId}
            onClick={() => {
              setWarehouseId(w.id)
              setEditorId(null)
            }}
          >
            {w.name}
          </Chip>
        ))}
      </div>

      {editorId !== null && (
        <TariffEditor
          note={editorNote}
          rows={editorRows}
          saving={saving}
          isNew={editorId === 'new'}
          onNoteChange={setEditorNote}
          onRowChange={updateRow}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          onSave={saveDraft}
          onCancel={closeEditor}
        />
      )}

      {loading && list.length === 0 ? (
        <div className="text-sm text-ink-muted">Загружаем…</div>
      ) : (
        <>
          {active && (
            <Card
              title={
                <div className="flex items-center gap-3">
                  <span>Активный тариф</span>
                  <Pill variant="ok">действует</Pill>
                </div>
              }
              actions={
                <button
                  onClick={() => openEditor('new')}
                  className="text-sm text-accent
                    hover:text-accent-strong"
                >
                  Создать новую версию →
                </button>
              }
            >
              <TariffTable tariff={active} />
              <div className="mt-3 text-xs text-ink-muted">
                действует с {fmtDateFull(active.effective_from)}
                {active.note ? ` · ${active.note}` : ''}
              </div>
            </Card>
          )}

          {drafts.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-serif text-lg font-semibold
                text-ink-secondary">
                Черновики и старые версии
              </h2>
              {drafts.map((t) => (
                <Card
                  key={t.id}
                  title={
                    <div className="flex items-center gap-3">
                      <span>Тариф #{t.id}</span>
                      <Pill variant="neutral">не активен</Pill>
                    </div>
                  }
                  actions={
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditor(t)}
                        className="text-sm text-ink-secondary
                          hover:text-accent"
                      >
                        Править
                      </button>
                      <button
                        onClick={() => activate(t.id)}
                        className="text-sm text-accent
                          hover:text-accent-strong"
                      >
                        Активировать
                      </button>
                      <button
                        onClick={() => drop(t.id)}
                        className="text-sm text-ink-secondary
                          hover:text-crit"
                      >
                        Удалить
                      </button>
                    </div>
                  }
                >
                  <TariffTable tariff={t} />
                  {t.note && (
                    <div className="mt-3 text-xs text-ink-muted">
                      {t.note}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {!active && drafts.length === 0 && (
            <EmptyState
              title="У склада нет тарифов"
              hint="Создайте новую версию и активируйте её."
            />
          )}
        </>
      )}
    </div>
  )
}

function TariffTable({ tariff }: { tariff: TariffFull }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-strong">
            <th className="label-caps px-4 py-2 text-left">
              Плотность, кг/м³
            </th>
            <th className="label-caps px-4 py-2 text-right">
              Ставка
            </th>
            <th className="label-caps px-4 py-2 text-right">
              Ед.
            </th>
          </tr>
        </thead>
        <tbody>
          {tariff.rows.map((r) => {
            const isM3 = r.rate_usd_per_m3 != null
            const rate = isM3
              ? Number(r.rate_usd_per_m3)
              : Number(r.rate_usd_per_kg)
            const rangeFrom = Number(r.density_from)
            const rangeTo = r.density_to ? Number(r.density_to) : null
            return (
              <tr key={r.id} className="border-b border-line-hair">
                <td className="px-4 py-2 font-mono-nums">
                  {rangeTo
                    ? `${rangeFrom} – ${rangeTo - 1}`
                    : `≥ ${rangeFrom}`}
                </td>
                <td className="px-4 py-2 text-right font-mono-nums">
                  ${rate.toFixed(isM3 ? 2 : 4)}
                </td>
                <td className="px-4 py-2 text-right text-ink-muted">
                  {isM3 ? '/м³' : '/кг'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface EditorProps {
  note: string
  rows: EditorRow[]
  saving: boolean
  isNew: boolean
  onNoteChange: (v: string) => void
  onRowChange: (
    idx: number, field: keyof EditorRow, value: string
  ) => void
  onAddRow: () => void
  onRemoveRow: (idx: number) => void
  onSave: () => void
  onCancel: () => void
}

function TariffEditor({
  note, rows, saving, isNew,
  onNoteChange, onRowChange, onAddRow, onRemoveRow,
  onSave, onCancel,
}: EditorProps) {
  return (
    <Card
      title={isNew ? 'Новая версия тарифа' : 'Правка черновика'}
      actions={
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Отмена
          </Button>
          <Button onClick={onSave} loading={saving}>
            Сохранить черновик
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Комментарий"
          optional
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="напр. пересчёт после роста расстояния"
        />

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="label-caps px-3 py-2 text-left">
                  Плотн. от
                </th>
                <th className="label-caps px-3 py-2 text-left">
                  Плотн. до
                </th>
                <th className="label-caps px-3 py-2 text-left">
                  Режим
                </th>
                <th className="label-caps px-3 py-2 text-left">
                  Ставка
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line-hair">
                  <td className="px-3 py-2">
                    <input
                      value={r.density_from}
                      onChange={(e) =>
                        onRowChange(
                          i, 'density_from', e.target.value,
                        )
                      }
                      inputMode="decimal"
                      className="w-24 h-8 rounded-md border
                        border-line bg-input px-2 font-mono-nums
                        text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={r.density_to}
                      onChange={(e) =>
                        onRowChange(
                          i, 'density_to', e.target.value,
                        )
                      }
                      inputMode="decimal"
                      placeholder="—"
                      className="w-24 h-8 rounded-md border
                        border-line bg-input px-2 font-mono-nums
                        text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.mode}
                      onChange={(e) =>
                        onRowChange(
                          i, 'mode', e.target.value as EditorMode,
                        )
                      }
                      className="h-8 rounded-md border border-line
                        bg-input px-2 text-sm"
                    >
                      <option value="per_kg">$/кг</option>
                      <option value="per_m3">$/м³</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={r.rate}
                      onChange={(e) =>
                        onRowChange(i, 'rate', e.target.value)
                      }
                      inputMode="decimal"
                      className="w-28 h-8 rounded-md border
                        border-line bg-input px-2 font-mono-nums
                        text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => onRemoveRow(i)}
                      className="text-xs text-ink-muted
                        hover:text-crit"
                    >
                      удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={onAddRow}
          className="text-sm text-accent hover:text-accent-strong"
        >
          + добавить строку
        </button>

        <div className="text-xs text-ink-muted">
          Верхняя граница пустая — открытый диапазон
          (например, «≥ 250»). Разрывов между строками быть
          не должно.
        </div>
      </div>
    </Card>
  )
}
