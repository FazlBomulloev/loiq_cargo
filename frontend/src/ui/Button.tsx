import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leadingIcon?: ReactNode
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md ' +
  'font-medium transition-colors duration-fast ease-soft ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'focus-visible:shadow-focus outline-none'

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-3 text-sm',
  md: 'h-9 px-4 text-md',
  lg: 'h-11 px-5 text-lg',
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-card hover:bg-accent-strong ' +
    'active:brightness-95',
  secondary:
    'bg-card border border-line text-ink-primary ' +
    'hover:bg-hover',
  ghost:
    'bg-transparent text-ink-secondary hover:bg-hover',
  danger:
    'bg-crit text-card hover:brightness-95',
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading,
      leadingIcon,
      className,
      children,
      disabled,
      ...rest
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cx(BASE, SIZES[size], VARIANTS[variant],
          className)}
        {...rest}
      >
        {leadingIcon}
        <span>{children}</span>
        {loading && (
          <span
            aria-hidden
            className="ml-1 h-3 w-3 rounded-full border-2
              border-current border-t-transparent animate-spin"
          />
        )}
      </button>
    )
  }
)
