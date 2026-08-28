import { useEffect } from 'react'
import { Pill } from '@/ui/Pill'
import { GoodsListItem } from '@/lib/types'
import {
  fmtDate, fmtDateFull, fmtDensity, fmtKg, fmtM3, fmtSomoni,
} from '@/lib/format'
import { statusLabel, statusVariant } from '@/lib/statusText'
import { cx } from '@/ui/utils'

interface Props {
  item: GoodsListItem | null
  onClose: () => void
}

const STEPS: {
  key: 'in_china' | 'in_transit' | 'in_dushanbe' | 'delivered'
  label: string
}[] = [
  { key: 'in_china', label: 'На складе Китая' },
  { key: 'in_transit', label: 'В пути' },
  { key: 'in_dushanbe', label: 'В Душанбе' },
  { key: 'delivered', label: 'Выдан' },
]

export function GoodsDrawer({ item, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (item) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  if (!item) return null

  const activeIdx = STEPS.findIndex((s) => s.key === item.status)

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/10" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-full
          sm:w-[460px] bg-card border-l border-line
          shadow-pop overflow-y-auto"
        role="dialog"
        aria-modal
      >
        <div className="p-4 sm:p-6 border-b border-line-hair
          flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl font-semibold">
              {item.description || 'Товар без описания'}
            </h2>
            <div className="mt-1 text-xs text-ink-muted
              font-mono-nums">
              {fmtKg(item.weight_kg)} ·
              {' '}{fmtM3(item.volume_m3)} ·
              {' '}{fmtDensity(item.density_kg_m3)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-ink-muted hover:text-ink-primary"
          >
            ✕
          </button>
        </div>

        <section className="p-4 sm:p-6 border-b border-line-hair">
          <div className="label-caps mb-3">Маршрут</div>
          <ol className="space-y-2">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center
                gap-3">
                <span className={cx(
                  'h-2.5 w-2.5 rounded-full',
                  i < activeIdx && 'bg-good',
                  i === activeIdx && 'bg-accent',
                  i > activeIdx && 'bg-line-strong',
                )} />
                <span className={cx(
                  'text-sm',
                  i === activeIdx
                    ? 'text-ink-primary font-medium'
                    : 'text-ink-secondary',
                )}>
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="p-4 sm:p-6 border-b border-line-hair">
          <div className="label-caps mb-3">Статус</div>
          <div className="flex flex-wrap gap-2">
            <Pill variant={statusVariant(item.status)}>
              {statusLabel(item.status)}
            </Pill>
            {item.is_burning && item.burning_days !== null && (
              <Pill variant="crit"
                tail={`${item.burning_days} д`}>
                горит
              </Pill>
            )}
          </div>
        </section>

        <section className="p-6 border-b border-line-hair
          grid grid-cols-2 gap-4">
          <Field
            label="Склад отправки"
            value={item.warehouse_name}
          />
          <Field
            label="Дата приёма"
            value={fmtDateFull(item.received_at)}
          />
          {item.arrived_in_dushanbe_at && (
            <Field
              label="В Душанбе"
              value={fmtDate(item.arrived_in_dushanbe_at)}
            />
          )}
          {item.shipment_number && (
            <Field label="Партия" value={item.shipment_number} />
          )}
        </section>

        <section className="p-4 sm:p-6">
          <div className="label-caps mb-3">Стоимость</div>
          <dl className="space-y-2 text-sm">
            <MoneyRow
              label="Фрахт"
              value={
                item.freight_somoni
                  ? fmtSomoni(item.freight_somoni)
                  : 'считается при отправке'
              }
            />
            <MoneyRow
              label="Простой"
              value={
                item.storage_fee_somoni
                  ? fmtSomoni(item.storage_fee_somoni)
                  : '—'
              }
            />
          </dl>
        </section>
      </aside>
    </div>
  )
}

function Field({
  label, value,
}: { label: string; value: string }) {
  return (
    <div>
      <div className="label-caps">{label}</div>
      <div className="text-sm mt-1">{value}</div>
    </div>
  )
}

function MoneyRow({
  label, value,
}: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between
      border-b border-line-hair py-1">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="font-mono-nums">{value}</dd>
    </div>
  )
}
