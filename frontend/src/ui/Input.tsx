import { forwardRef, InputHTMLAttributes } from 'react'
import { cx } from './utils'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  suffix?: string
  numeric?: boolean
  optional?: boolean
}

const FIELD =
  'h-9 w-full rounded-md border border-line bg-input px-3 ' +
  'text-ink-primary placeholder-ink-faint outline-none ' +
  'transition-colors duration-fast ease-soft ' +
  'focus:border-accent focus:shadow-focus'

export const Input = forwardRef<HTMLInputElement, Props>(
  function Input(
    {
      label, hint, error, suffix, numeric, optional,
      className, id, ...rest
    },
    ref
  ) {
    const inputId = id || rest.name
    return (
      <label className="block">
        {label && (
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-sm text-ink-secondary
              font-medium">
              {label}
            </span>
            {optional && (
              <span className="text-xs text-ink-muted">
                (опц.)
              </span>
            )}
          </div>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={cx(
              FIELD,
              numeric &&
                'font-mono-nums text-right pr-12',
              error && 'border-crit',
              className
            )}
            {...rest}
          />
          {suffix && (
            <span className="pointer-events-none absolute
              right-3 top-1/2 -translate-y-1/2
              text-xs text-ink-muted">
              {suffix}
            </span>
          )}
        </div>
        {error ? (
          <div className="mt-1 text-xs text-crit">{error}</div>
        ) : hint ? (
          <div className="mt-1 text-xs text-ink-muted">
            {hint}
          </div>
        ) : null}
      </label>
    )
  }
)
