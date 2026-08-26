import type { GoodsStatus } from './types'
import type { PillVariant } from '@/ui/Pill'

const LABEL: Record<GoodsStatus, string> = {
  in_china: 'на складе',
  in_transit: 'в пути',
  in_dushanbe: 'в Душанбе',
  delivered: 'выдан',
}

const VARIANT: Record<GoodsStatus, PillVariant> = {
  in_china: 'neutral',
  in_transit: 'route',
  in_dushanbe: 'ok',
  delivered: 'info',
}

export function statusLabel(s: GoodsStatus): string {
  return LABEL[s]
}

export function statusVariant(s: GoodsStatus): PillVariant {
  return VARIANT[s]
}
