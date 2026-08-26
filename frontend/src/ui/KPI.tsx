import { ReactNode } from 'react'
import { cx } from './utils'

interface Props {
  label: string
  value: ReactNode
  hint?: ReactNode
  className?: string
}

export function KPI({ label, value, hint, className }: Props) {
  return (
    <div
      className={cx(
        'rounded-md border border-line bg-card p-5',
        'shadow-card',
        className
      )}
    >
      <div className="label-caps">{label}</div>
      <div className="mt-2 text-2xl font-semibold
        text-ink-primary font-mono-nums">
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-ink-muted">
          {hint}
        </div>
      )}
    </div>
  )
}
