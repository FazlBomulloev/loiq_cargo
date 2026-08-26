import { ReactNode } from 'react'

interface Props {
  title: string
  hint?: ReactNode
  action?: ReactNode
  illustration?: ReactNode
}

export function EmptyState({
  title, hint, action, illustration,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center
      gap-3 py-12 text-center">
      {illustration}
      <h4 className="font-serif text-2xl text-ink-primary">
        {title}
      </h4>
      {hint && (
        <p className="max-w-md text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
