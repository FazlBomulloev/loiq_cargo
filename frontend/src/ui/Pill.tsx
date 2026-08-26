import { HTMLAttributes, ReactNode } from 'react'
import { cx } from './utils'

export type PillVariant =
  | 'neutral' | 'route' | 'ok' | 'warn' | 'crit'
  | 'info' | 'outline'

const STYLES: Record<PillVariant, string> = {
  neutral: 'bg-[#F0E7D3] text-ink-muted',
  route: 'bg-accent-tint text-accent-strong',
  ok: 'bg-good-tint text-good',
  warn: 'bg-warn-tint text-warn',
  crit: 'bg-crit-tint text-crit',
  info: 'bg-info-tint text-info',
  outline: 'bg-transparent text-ink-primary border border-line',
}

const DOT: Record<PillVariant, string> = {
  neutral: 'bg-ink-muted',
  route: 'bg-accent-strong',
  ok: 'bg-good',
  warn: 'bg-warn',
  crit: 'bg-crit',
  info: 'bg-info',
  outline: 'bg-ink-primary',
}

interface Props extends HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant
  tail?: ReactNode
  showDot?: boolean
}

export function Pill({
  variant = 'neutral',
  tail, showDot = true,
  className, children, ...rest
}: Props) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full',
        'px-2 py-[3px] text-2xs font-medium',
        STYLES[variant],
        className
      )}
      {...rest}
    >
      {showDot && (
        <span
          aria-hidden
          className={cx(
            'inline-block h-1.5 w-1.5 rounded-full',
            DOT[variant]
          )}
        />
      )}
      <span>{children}</span>
      {tail && (
        <span className="ml-1 font-mono-nums">· {tail}</span>
      )}
    </span>
  )
}
