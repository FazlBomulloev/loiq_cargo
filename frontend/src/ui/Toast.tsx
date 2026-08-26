import {
  createContext, ReactNode, useCallback, useContext,
  useEffect, useMemo, useState,
} from 'react'
import { cx } from './utils'

type Kind = 'info' | 'ok' | 'warn' | 'crit'

interface Toast {
  id: number
  kind: Kind
  text: string
  action?: { label: string; onClick: () => void }
  ttl: number
}

interface Ctx {
  push: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => void
}

const ToastCtx = createContext<Ctx | null>(null)

let seq = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback<Ctx['push']>((t) => {
    const id = seq++
    const ttl = t.ttl ?? 5000
    setItems((xs) => [...xs, { ...t, id, ttl }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])

  useEffect(() => {
    if (items.length === 0) return
    const timers = items.map((t) =>
      window.setTimeout(() => dismiss(t.id), t.ttl)
    )
    return () => {
      timers.forEach((h) => window.clearTimeout(h))
    }
  }, [items, dismiss])

  const ctx = useMemo<Ctx>(() => ({ push }), [push])

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex
        flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'rounded-md border bg-card shadow-pop',
              'flex items-start gap-3 p-3 text-sm',
              t.kind === 'ok' && 'border-good',
              t.kind === 'info' && 'border-info',
              t.kind === 'warn' && 'border-warn',
              t.kind === 'crit' && 'border-crit',
            )}
          >
            <span
              aria-hidden
              className={cx(
                'mt-1 h-2 w-2 rounded-full',
                t.kind === 'ok' && 'bg-good',
                t.kind === 'info' && 'bg-info',
                t.kind === 'warn' && 'bg-warn',
                t.kind === 'crit' && 'bg-crit',
              )}
            />
            <div className="flex-1 text-ink-primary">{t.text}</div>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
                className="text-accent hover:text-accent-strong
                  text-xs font-medium"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx)
  if (!ctx) {
    throw new Error('useToast: обёртка ToastProvider отсутствует')
  }
  return ctx
}
