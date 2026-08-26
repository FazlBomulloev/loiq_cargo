const NBSP = ' '

export function fmtInt(n: number | string): string {
  const num = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(num)) return String(n)
  return Math.round(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

export function fmtDecimal(
  n: number | string,
  places = 2
): string {
  const num = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(num)) return String(n)
  const fixed = num.toFixed(places)
  const [i, f] = fixed.split('.')
  const withSep = i.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return f ? `${withSep},${f}` : withSep
}

export function fmtKg(n: number | string): string {
  return `${fmtInt(n)} кг`
}

export function fmtM3(n: number | string): string {
  return `${fmtDecimal(n, 2)} м³`
}

export function fmtDensity(n: number | string): string {
  return `${fmtInt(n)} кг/м³`
}

export function fmtSomoni(n: number | string): string {
  return `${fmtDecimal(n, 0)} c.`
}

export function fmtUsd(n: number | string): string {
  const num = typeof n === 'string' ? Number(n) : n
  return `$${fmtDecimal(num, 2)}`
}

export function fmtUsdK(n: number | string): string {
  const num = typeof n === 'string' ? Number(n) : n
  return `$${(num / 1000).toFixed(1)}k`
}

export function fmtRate(n: number | string): string {
  return `${fmtUsd(n)}/кг`
}

const MONTHS = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

export function fmtDate(iso: string | Date | null): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function fmtDateFull(iso: string | Date | null): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function daysSince(iso: string | Date): number {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const delta = Date.now() - d.getTime()
  return Math.max(0, Math.floor(delta / (1000 * 60 * 60 * 24)))
}
