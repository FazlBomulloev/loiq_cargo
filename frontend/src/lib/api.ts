const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

const TOKEN_KEY = 'loik.token'
const KIND_KEY = 'loik.kind'

export type PrincipalKind = 'staff' | 'client'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getKind(): PrincipalKind | null {
  const v = localStorage.getItem(KIND_KEY)
  return v === 'staff' || v === 'client' ? v : null
}

export function saveToken(
  token: string,
  kind: PrincipalKind
): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(KIND_KEY, kind)
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(KIND_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  signal?: AbortSignal
}

export async function api<T>(
  path: string,
  opts: RequestOpts = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (opts.auth !== false) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body:
      opts.body === undefined ? undefined : JSON.stringify(
        opts.body,
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v)
      ),
    signal: opts.signal,
  })

  if (res.status === 204) {
    return undefined as unknown as T
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    throw new ApiError(res.status, formatError(data, res.status))
  }
  return data as T
}

function formatError(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const detail = d.detail ?? d.message
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const parts = detail.map((it) => {
        if (typeof it === 'string') return it
        if (it && typeof it === 'object') {
          const o = it as Record<string, unknown>
          const msg = o.msg ?? o.message
          if (typeof msg === 'string') return msg
        }
        try { return JSON.stringify(it) } catch { return String(it) }
      })
      return parts.join('; ')
    }
    if (detail && typeof detail === 'object') {
      const o = detail as Record<string, unknown>
      const msg = o.msg ?? o.message
      if (typeof msg === 'string') return msg
      try { return JSON.stringify(detail) } catch { /* fall through */ }
    }
  }
  return `Ошибка ${status}`
}
