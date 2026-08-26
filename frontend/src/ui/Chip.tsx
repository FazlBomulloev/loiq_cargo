import { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './utils'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  count?: number | null
  children: ReactNode
}

export function Chip({
  active, count, className, children, ...rest
}: Props) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full',
        'px-3 py-1 text-sm border transition-colors',
        'duration-fast ease-soft',
        active
          ? 'bg-accent-tint text-accent-strong ' +
              'border-accent-tint font-medium'
          : 'bg-transparent text-ink-secondary ' +
              'border-line hover:bg-hover',
        className,
      )}
      {...rest}
    >
      <span>{children}</span>
      {count != null && count > 0 && (
        <span className="font-mono-nums text-xs opacity-70">
          {count}
        </span>
      )}
    </button>
  )
}
