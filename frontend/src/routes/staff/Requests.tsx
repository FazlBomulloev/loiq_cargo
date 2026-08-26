import { useEffect, useState } from 'react'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Table } from '@/ui/Table'
import { Pill } from '@/ui/Pill'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { EmptyState } from '@/ui/EmptyState'
import { api, ApiError } from '@/lib/api'
import { ChangeRequestOut, StaffMe } from '@/lib/types'
import {
  fmtDateFull, fmtDensity, fmtKg, fmtM3,
} from '@/lib/format'
import { useToast } from '@/ui/Toast'
import { cx } from '@/ui/utils'

interface Props {
  me: StaffMe
}

type Scope = 'mine' | 'pending' | 'all'

const ACTION_LABEL: Record<string, string> = {
  edit_goods: 'Правка товара',
  delete_goods: 'Удаление товара',
  other: 'Прочее',
}

function statusPill(s: ChangeRequestOut['status']) {
  if (s === 'pending')
    return <Pill variant="warn">на рассмотрении</Pill>
  if (s === 'applied') return <Pill variant="ok">применено</Pill>
  return <Pill variant="crit">отклонено</Pill>
}

export function StaffRequests({ me }: Props) {
  const isOwner = me.role === 'owner'
  const [scope, setScope] = useState<Scope>(
    isOwner ? 'pending' : 'mine'
  )
  const [rows, setRows] = useState<ChangeRequestOut[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)
  const toast = useToast()

  async function reload() {
    setLoading(true)
    try {
      const r = await api<ChangeRequestOut[]>(
        `/change-requests?scope=${scope}`
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
    void reload()
  }, [scope])

  const scopes: Scope[] = isOwner
    ? ['pending', 'all', 'mine']
    : ['mine']
  const scopeLabel: Record<Scope, string> = {
    mine: 'Мои',
    pending: 'На рассмотрении',
    all: 'Все',
  }

  const openRow = rows.find((r) => r.id === openId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Заявки
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          {isOwner
            ? 'Овнер рассматривает и применяет правки/удаления.'
            : ('Правки и удаления приёмок проходят через ' +
              'овнера. Здесь — статус ваших заявок.')}
        </p>
      </div>

      {scopes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {scopes.map((s) => (
            <Chip
              key={s}
              active={scope === s}
              onClick={() => setScope(s)}
            >
              {scopeLabel[s]}
            </Chip>
          ))}
        </div>
      )}

      <Card padded={false}>
        {loading ? (
          <div className="px-4 py-10 text-center text-ink-muted
            text-sm">
            Загружаем…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              scope === 'pending'
                ? 'Нет заявок в очереди'
                : scope === 'mine'
                  ? 'Ваших заявок нет'
                  : 'Заявок нет'
            }
            hint={
              scope === 'mine'
                ? 'Создайте заявку из карточки товара.'
                : ''
            }
          />
        ) : (
          <Table
            columns={[
              {
                key: 'action',
                header: 'Действие',
                cell: (r) => (
                  <span className="text-ink-primary">
                    {ACTION_LABEL[r.action] ?? r.action}
                  </span>
                ),
              },
              {
                key: 'goods',
                header: 'Товар',
                cell: (r) =>
                  r.goods_preview ? (
                    <div>
                      <div className="text-accent-strong">
                        {r.goods_preview.client_code ||
                          'без клиента'}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {r.goods_preview.description ||
                          'без описания'}
                      </div>
                    </div>
                  ) : (
                    <span className="text-ink-muted">
                      #{r.goods_id ?? '—'}
                    </span>
                  ),
              },
              {
                key: 'author',
                header: 'Автор',
                cell: (r) => r.author_name,
              },
              {
                key: 'reason',
                header: 'Причина',
                cell: (r) =>
                  r.reason ? (
                    <span title={r.reason}>
                      {r.reason.length > 40
                        ? r.reason.slice(0, 40) + '…'
                        : r.reason}
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  ),
              },
              {
                key: 'created',
                header: 'Создана',
                cell: (r) => fmtDateFull(r.created_at),
                align: 'right',
              },
              {
                key: 'status',
                header: 'Статус',
                cell: (r) => statusPill(r.status),
              },
              {
                key: 'act',
                header: '',
                align: 'right',
                cell: (r) =>
                  isOwner && r.status === 'pending' ? (
                    <button
                      onClick={() => setOpenId(r.id)}
                      className="text-sm text-accent
                        hover:text-accent-strong"
                    >
                      рассмотреть
                    </button>
                  ) : (
                    <button
                      onClick={() => setOpenId(r.id)}
                      className="text-sm text-ink-secondary
                        hover:text-accent"
                    >
                      подробнее
                    </button>
                  ),
              },
            ]}
            rows={rows}
            rowKey={(r) => r.id}
            density="dense"
          />
        )}
      </Card>

      {openRow && (
        <RequestDrawer
          request={openRow}
          canDecide={isOwner && openRow.status === 'pending'}
          onClose={() => setOpenId(null)}
          onDecided={() => {
            setOpenId(null)
            void reload()
          }}
        />
      )}
    </div>
  )
}

function RequestDrawer({
  request, canDecide, onClose, onDecided,
}: {
  request: ChangeRequestOut
  canDecide: boolean
  onClose: () => void
  onDecided: () => void
}) {
  const [decisionNote, setDecisionNote] = useState('')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(
    null
  )
  const toast = useToast()

  async function decide(approve: boolean) {
    if (!approve && !decisionNote.trim()) {
      toast.push({
        kind: 'warn',
        text: 'Для отклонения обязателен комментарий',
      })
      return
    }
    setBusy(approve ? 'approve' : 'reject')
    try {
      await api<ChangeRequestOut>(
        `/change-requests/${request.id}/decide`,
        {
          method: 'POST',
          body: {
            approve,
            decision_note: decisionNote.trim() || null,
          },
        }
      )
      toast.push({
        kind: 'ok',
        text: approve
          ? `Заявка #${request.id} применена`
          : `Заявка #${request.id} отклонена`,
      })
      onDecided()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message :
        e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'crit', text: msg })
    } finally {
      setBusy(null)
    }
  }

  const preview = request.goods_preview
  const payload = request.payload as Record<string, unknown>

  return (
    <div
      className="fixed inset-0 z-40 bg-ink-primary/20
        flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-card border-l border-line
          overflow-y-auto"
      >
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="label-caps">
                Заявка #{request.id}
              </div>
              <h2 className="font-serif text-2xl font-semibold
                mt-0.5">
                {ACTION_LABEL[request.action] ?? request.action}
              </h2>
              <div className="text-sm text-ink-muted mt-1">
                {request.author_name} ·{' '}
                {fmtDateFull(request.created_at)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-ink-secondary hover:text-accent"
            >
              ✕
            </button>
          </div>

          {preview && (
            <div className="rounded-md border border-line
              bg-elev p-4 space-y-2">
              <div className="label-caps">Текущий товар</div>
              <div className="flex justify-between text-sm">
                <div>
                  <div className="text-accent-strong
                    font-medium">
                    {preview.client_code || 'без клиента'}
                  </div>
                  <div className="text-ink-muted text-xs">
                    {preview.description || 'без описания'}
                    {' · '}
                    {preview.warehouse_name}
                  </div>
                </div>
                <div className="font-mono-nums text-right">
                  <div>{fmtKg(preview.weight_kg)}</div>
                  <div>{fmtM3(preview.volume_m3)}</div>
                  <div className="text-xs text-ink-muted">
                    {fmtDensity(preview.density_kg_m3)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {request.action === 'edit_goods' && (
            <div className="rounded-md border border-line
              bg-card p-4 space-y-2">
              <div className="label-caps">Предлагается</div>
              {Object.entries(payload).map(([k, v]) => {
                const label = FIELD_LABEL[k] ?? k
                const cur = currentValue(k, preview)
                const nxt = formatValue(k, v)
                return (
                  <div key={k} className="flex justify-between
                    text-sm">
                    <span className="text-ink-secondary">
                      {label}
                    </span>
                    <span className="font-mono-nums">
                      <span className="text-ink-muted line-through
                        mr-2">
                        {cur}
                      </span>
                      <span className="text-accent-strong
                        font-medium">
                        {nxt}
                      </span>
                    </span>
                  </div>
                )
              })}
              <div className="text-xs text-ink-muted pt-1
                border-t border-line-hair">
                при применении плотность и фрахт будут
                пересчитаны по активному тарифу склада
              </div>
            </div>
          )}

          {request.action === 'delete_goods' && (
            <div className="rounded-md border-l-4 border-crit
              bg-crit-tint/40 p-4 text-sm">
              Товар будет удалён из системы. Действие
              необратимо и возможно только пока товар
              на складе Китая.
            </div>
          )}

          {request.reason && (
            <div>
              <div className="label-caps">Причина автора</div>
              <div className="text-sm mt-1">{request.reason}</div>
            </div>
          )}

          {request.decision_note && (
            <div>
              <div className="label-caps">Комментарий овнера</div>
              <div className="text-sm mt-1">
                {request.decision_note}
              </div>
            </div>
          )}

          {canDecide && (
            <div className="border-t border-line-hair pt-4
              space-y-3">
              <Input
                label="Комментарий (обязателен при отклонении)"
                optional
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
              />
              <div className={cx(
                'flex gap-2 justify-end',
              )}>
                <Button
                  variant="ghost"
                  onClick={() => decide(false)}
                  loading={busy === 'reject'}
                  disabled={busy === 'approve'}
                >
                  Отклонить
                </Button>
                <Button
                  onClick={() => decide(true)}
                  loading={busy === 'approve'}
                  disabled={busy === 'reject'}
                >
                  Применить
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const FIELD_LABEL: Record<string, string> = {
  description: 'Описание',
  weight_kg: 'Вес',
  volume_m3: 'Объём',
}

function currentValue(
  key: string,
  preview: ChangeRequestOut['goods_preview']
): string {
  if (!preview) return '—'
  if (key === 'description')
    return preview.description || 'без описания'
  if (key === 'weight_kg') return fmtKg(preview.weight_kg)
  if (key === 'volume_m3') return fmtM3(preview.volume_m3)
  return '—'
}

function formatValue(key: string, v: unknown): string {
  if (v == null) return '—'
  if (key === 'weight_kg') return fmtKg(String(v))
  if (key === 'volume_m3') return fmtM3(String(v))
  return String(v)
}
