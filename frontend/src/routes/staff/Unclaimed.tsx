import { useEffect, useState } from 'react'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { EmptyState } from '@/ui/EmptyState'
import { api, ApiError } from '@/lib/api'
import {
  BindClientResponse, ClientLookup, StaffMe,
  UnclaimedRow, Warehouse,
} from '@/lib/types'
import {
  fmtDate, fmtDensity, fmtKg, fmtM3,
} from '@/lib/format'
import { useToast } from '@/ui/Toast'
import { statusLabel, statusVariant } from '@/lib/statusText'
import { cx } from '@/ui/utils'

interface Props {
  me: StaffMe
  warehouses: Warehouse[]
}

export function StaffUnclaimed({ me, warehouses }: Props) {
  const isOwner = me.role === 'owner'
  const [filter, setFilter] = useState<number | null>(null)
  const [rows, setRows] = useState<UnclaimedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [bindingId, setBindingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deletingBusy, setDeletingBusy] = useState<number | null>(
    null
  )
  const toast = useToast()

  async function deleteRow(id: number) {
    setDeletingBusy(id)
    try {
      await api(`/unclaimed/${id}`, { method: 'DELETE' })
      toast.push({
        kind: 'ok',
        text: `Товар #${id} удалён`,
      })
      setRows((xs) => xs.filter((r) => r.id !== id))
      setDeletingId(null)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setDeletingBusy(null)
    }
  }

  async function reload() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter != null) {
        params.set('warehouse_id', String(filter))
      }
      const r = await api<UnclaimedRow[]>(
        `/unclaimed${params.toString() ? `?${params}` : ''}`
      )
      setRows(r)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOwner) void reload()
  }, [filter, isOwner])

  if (!isOwner) {
    return (
      <EmptyState
        title="Только для овнера"
        hint="Привязка товаров «без клиента» — задача владельца."
      />
    )
  }

  const openRow = rows.find((r) => r.id === bindingId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Без клиента
          {rows.length > 0 && (
            <span className="text-ink-muted font-sans
              font-normal text-lg ml-3">
              {rows.length} товаров
            </span>
          )}
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Приёмки с неизвестным кодом клиента. Найдите
          владельца и привяжите товар — уведомление уйдёт
          автоматически.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip
          active={filter == null}
          onClick={() => setFilter(null)}
        >
          Все склады
        </Chip>
        {warehouses.map((w) => (
          <Chip
            key={w.id}
            active={filter === w.id}
            onClick={() => setFilter(w.id)}
          >
            {w.name}
          </Chip>
        ))}
      </div>

      <Card padded={false}>
        {loading && rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-ink-muted
            text-sm">
            Загружаем…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Неопознанных товаров нет"
            hint="Хорошая работа — все приёмки привязаны."
          />
        ) : (
          <Table
            columns={[
              {
                key: 'wh',
                header: 'Склад',
                cell: (r) => r.warehouse_name,
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
                key: 'status',
                header: 'Статус',
                cell: (r) => (
                  <div className="flex flex-wrap gap-1.5">
                    <Pill variant={statusVariant(r.status)}>
                      {statusLabel(r.status)}
                    </Pill>
                    {r.shipment_number && (
                      <span className="text-xs
                        text-ink-muted font-mono-nums">
                        {r.shipment_number}
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: 'received',
                header: 'Принят',
                align: 'right',
                cell: (r) => fmtDate(r.received_at),
              },
              {
                key: 'act',
                header: '',
                align: 'right',
                cell: (r) => {
                  const canDelete =
                    r.status === 'in_china' &&
                    !r.shipment_number
                  return (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setBindingId(r.id)}
                        className="text-sm text-accent
                          hover:text-accent-strong"
                      >
                        привязать
                      </button>
                      <button
                        onClick={() => setDeletingId(r.id)}
                        disabled={!canDelete}
                        className={
                          canDelete
                            ? 'text-sm text-crit hover:brightness-90'
                            : 'text-sm text-ink-faint cursor-not-allowed'
                        }
                        title={
                          canDelete
                            ? 'Удалить товар без клиента'
                            : 'Удалять можно только на складе КНР ' +
                              'до отправки'
                        }
                      >
                        удалить
                      </button>
                    </div>
                  )
                },
              },
            ]}
            rows={rows}
            rowKey={(r) => r.id}
            density="dense"
          />
        )}
      </Card>

      {openRow && (
        <BindDrawer
          row={openRow}
          onClose={() => setBindingId(null)}
          onBound={() => {
            setBindingId(null)
            void reload()
          }}
        />
      )}

      {deletingId !== null && (
        <ConfirmDeleteDialog
          row={rows.find((r) => r.id === deletingId) ?? null}
          busy={deletingBusy === deletingId}
          onCancel={() => setDeletingId(null)}
          onConfirm={() => deleteRow(deletingId)}
        />
      )}
    </div>
  )
}

function ConfirmDeleteDialog({
  row, busy, onCancel, onConfirm,
}: {
  row: UnclaimedRow | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!row) return null
  return (
    <div
      className="fixed inset-0 z-40 bg-ink-primary/30
        flex items-center justify-center px-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        className="w-full max-w-md bg-card border border-line
          rounded-md shadow-pop p-4 sm:p-6 space-y-4"
      >
        <div>
          <div className="label-caps">Удалить товар</div>
          <h3 className="font-serif text-xl mt-1">
            #{row.id} · {row.warehouse_name}
          </h3>
          <div className="text-sm text-ink-muted mt-1">
            {row.description || 'без описания'} ·{' '}
            {fmtKg(row.weight_kg)}, {fmtM3(row.volume_m3)}
          </div>
        </div>
        <p className="text-sm text-ink-secondary">
          Товар без клиента будет удалён навсегда. Это действие
          нельзя отменить.
        </p>
        <div className="flex justify-end gap-2 border-t
          border-line-hair pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-4 text-sm text-ink-secondary
              hover:text-accent disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="h-9 px-4 rounded-md text-sm font-medium
              bg-crit text-card hover:brightness-95
              disabled:opacity-50"
          >
            {busy ? 'Удаляем…' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BindDrawer({
  row, onClose, onBound,
}: {
  row: UnclaimedRow
  onClose: () => void
  onBound: () => void
}) {
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<ClientLookup | null>(
    null
  )
  const [state, setState] = useState<
    'idle' | 'searching' | 'found' | 'not-found'
  >('idle')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const codeUpper = code.trim().toUpperCase()

  useEffect(() => {
    if (!codeUpper) {
      setLookup(null)
      setState('idle')
      return
    }
    let cancelled = false
    setState('searching')
    const t = window.setTimeout(async () => {
      try {
        const res = await api<ClientLookup | null>(
          `/warehouses/${row.warehouse_id}/clients/lookup` +
            `?code=${encodeURIComponent(codeUpper)}`
        )
        if (cancelled) return
        if (res) {
          setLookup(res)
          setState('found')
        } else {
          setLookup(null)
          setState('not-found')
        }
      } catch {
        if (!cancelled) setState('idle')
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [codeUpper, row.warehouse_id])

  async function bind() {
    if (state !== 'found' || !lookup) return
    setSaving(true)
    try {
      const res = await api<BindClientResponse>(
        `/goods/${row.id}/bind-client`,
        {
          method: 'POST',
          body: { client_code: codeUpper },
        }
      )
      toast.push({
        kind: 'ok',
        text: `Товар #${res.goods_id} привязан к ${
          res.client_code}${
          res.notified ? ' · уведомление отправлено' : ''}`,
      })
      onBound()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-ink-primary/20
        flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-card border-l border-line
          overflow-y-auto"
      >
        <div className="p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start
            justify-between gap-3">
            <div>
              <div className="label-caps">Товар</div>
              <h2 className="font-serif text-xl font-semibold
                mt-0.5">
                #{row.id} · {row.warehouse_name}
              </h2>
              <div className="text-sm text-ink-muted mt-1">
                {row.description || 'без описания'}
                {' · '}
                {fmtKg(row.weight_kg)}, {fmtM3(row.volume_m3)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-ink-secondary hover:text-accent"
            >
              ✕
            </button>
          </div>

          <div>
            <label className="block">
              <div className="mb-1 text-sm text-ink-secondary
                font-medium">
                Код клиента
              </div>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="LQ-007"
                autoFocus
                className="h-9 w-full rounded-md border border-line
                  bg-input px-3 text-ink-primary
                  placeholder-ink-faint outline-none
                  focus:border-accent focus:shadow-focus"
              />
            </label>
            <div className="mt-2 text-xs text-ink-muted">
              {state === 'searching' && 'Ищем клиента…'}
              {state === 'not-found' && (
                <span className="text-warn">
                  клиент {codeUpper} не найден
                </span>
              )}
              {state === 'found' && lookup && (
                <span className="text-good">
                  {lookup.full_name} · {lookup.phone}
                </span>
              )}
              {state === 'idle' && ' '}
            </div>
          </div>

          {state === 'found' && lookup && (
            <div className={cx(
              'rounded-md border border-line bg-elev p-3',
              'text-sm space-y-1',
            )}>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Имя</span>
                <span>{lookup.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Телефон</span>
                <span className="font-mono-nums">
                  {lookup.phone}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Telegram</span>
                <span>
                  {lookup.telegram_status === 'verified' ? (
                    <span className="text-good">
                      привязан — уведомление уйдёт
                    </span>
                  ) : (
                    <span className="text-warn">
                      не привязан
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          <div className="border-t border-line-hair pt-4
            flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-sm text-ink-secondary
                hover:text-accent disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={bind}
              disabled={state !== 'found' || saving}
              className={cx(
                'rounded-md h-9 px-4 text-sm font-medium',
                state === 'found' && !saving
                  ? 'bg-accent text-card hover:bg-accent-strong'
                  : 'bg-accent-tint text-ink-faint ' +
                    'cursor-not-allowed',
              )}
            >
              {saving ? 'Привязываем…' : 'Привязать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
