import { ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, clearAuth, getKind, getToken } from '@/lib/api'
import { ClientMe, Me } from '@/lib/types'

interface Props {
  children: (me: ClientMe) => ReactNode
}

export function RequireClient({ children }: Props) {
  const [me, setMe] = useState<ClientMe | null>(null)
  const [state, setState] = useState<'load' | 'ok' | 'kick'>(
    'load'
  )

  useEffect(() => {
    const token = getToken()
    const kind = getKind()
    if (!token || kind !== 'client') {
      setState('kick')
      return
    }
    api<Me>('/auth/me')
      .then((m) => {
        if (m.kind === 'client') {
          setMe(m)
          setState('ok')
        } else {
          setState('kick')
        }
      })
      .catch(() => {
        clearAuth()
        setState('kick')
      })
  }, [])

  if (state === 'load') {
    return (
      <div className="min-h-screen grid place-items-center
        text-ink-muted text-sm">
        Загружаем кабинет…
      </div>
    )
  }
  if (state === 'kick' || !me) {
    return <Navigate to="/login" replace />
  }
  return <>{children(me)}</>
}
