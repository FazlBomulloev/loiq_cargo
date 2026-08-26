import { forwardRef, SelectHTMLAttributes, ReactNode } from 'react'
import { cx } from './utils'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  function Select({ label, className, children, ...rest }, ref) {
    return (
      <label className="block">
        {label && (
          <div className="mb-1 text-sm text-ink-secondary
            font-medium">
            {label}
          </div>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={cx(
              'h-9 w-full appearance-none rounded-md border ' +
                'border-line bg-input pl-3 pr-9 ' +
                'text-ink-primary outline-none ' +
                'transition-colors duration-fast ease-soft ' +
                'focus:border-accent focus:shadow-focus',
              className
            )}
            {...rest}
          >
            {children}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="pointer-events-none absolute right-3
              top-1/2 -translate-y-1/2 h-3 w-3
              text-ink-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </div>
      </label>
    )
  }
)
