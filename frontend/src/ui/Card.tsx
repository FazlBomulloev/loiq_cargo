import { HTMLAttributes, ReactNode } from 'react'
import { cx } from './utils'

interface Props
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  padded?: boolean
}

export function Card({
  title, actions, footer, padded = true,
  className, children, ...rest
}: Props) {
  return (
    <section
      className={cx(
        'rounded-md border border-line bg-card shadow-card',
        className
      )}
      {...rest}
    >
      {(title || actions) && (
        <header
          className="flex flex-wrap items-center justify-between
            gap-x-4 gap-y-2 border-b border-line-hair
            px-4 sm:px-6 py-3 sm:py-4"
        >
          <h3 className="text-lg font-semibold text-ink-primary">
            {title}
          </h3>
          {actions}
        </header>
      )}
      <div className={cx(padded && 'p-4 sm:p-6')}>{children}</div>
      {footer && (
        <footer
          className="border-t border-line-hair
            px-4 sm:px-6 py-3 sm:py-4"
        >
          {footer}
        </footer>
      )}
    </section>
  )
}
