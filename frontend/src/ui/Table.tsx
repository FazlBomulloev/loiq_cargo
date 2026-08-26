import { ReactNode } from 'react'
import { cx } from './utils'

export type Density = 'dense' | 'regular' | 'airy'

interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  numeric?: boolean
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  density?: Density
  onRowClick?: (row: T) => void
  empty?: ReactNode
  className?: string
}

const ROW_PAD: Record<Density, string> = {
  dense: 'py-2',
  regular: 'py-3',
  airy: 'py-4',
}

export function Table<T>({
  columns, rows, rowKey,
  density = 'regular', onRowClick, empty,
  className,
}: Props<T>) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-strong">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx(
                  'label-caps px-4 py-2 text-left',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center
                  text-ink-muted"
              >
                {empty ?? 'Ничего не найдено.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={
                  onRowClick ? () => onRowClick(row) : undefined
                }
                className={cx(
                  'border-b border-line-hair',
                  onRowClick && 'cursor-pointer hover:bg-hover',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      'px-4', ROW_PAD[density],
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.numeric && 'font-mono-nums',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
