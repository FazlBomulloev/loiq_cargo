export type PrincipalKind = 'staff' | 'client'

export interface StaffMe {
  kind: 'staff'
  id: number
  email: string
  full_name: string
  role: string
  warehouse_id: number | null
  is_active: boolean
}

export interface ClientMe {
  kind: 'client'
  id: number
  client_code: string
  full_name: string
  phone: string
  telegram_status: 'not_started' | 'pending' | 'verified'
  is_active: boolean
}

export type Me = StaffMe | ClientMe

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  principal_kind: PrincipalKind
}

export interface Warehouse {
  id: number
  code: 'yiwu' | 'urumqi' | 'kashgar'
  name: string
  is_source: boolean
  truck_volume_m3: string
  truck_weight_kg: string
  multiplier: string
}

export interface CalcResponse {
  warehouse_id: number
  warehouse_name: string
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  density_from: string
  density_to: string | null
  rate_usd_per_kg: string
  freight_usd: string
  freight_somoni: string
  exchange_rate: string
}

export interface ClientRegisterResponse {
  client_code: string
  telegram_verification_code: string
  telegram_deep_link: string
  access_token: string
  expires_in: number
  principal_kind: 'client'
}

export interface VerifyCodeResponse {
  telegram_verification_code: string
  telegram_status: 'not_started' | 'pending' | 'verified'
  telegram_deep_link: string
}

export interface ClientSummary {
  in_china_count: number
  in_transit_count: number
  in_dushanbe_count: number
  in_dushanbe_oldest_days: number | null
  debt_somoni: string
}

export type GoodsStatus =
  | 'in_china'
  | 'in_transit'
  | 'in_dushanbe'
  | 'delivered'

export interface GoodsListItem {
  id: number
  description: string | null
  warehouse_code: string
  warehouse_name: string
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  status: GoodsStatus
  is_burning: boolean
  burning_days: number | null
  received_at: string
  arrived_in_dushanbe_at: string | null
  freight_somoni: string | null
  storage_fee_somoni: string | null
  shipment_number: string | null
}

export interface ClientLookup {
  client_code: string
  full_name: string
  phone: string
  telegram_status: 'not_started' | 'pending' | 'verified'
  is_active: boolean
}

export interface GoodsListRow {
  id: number
  client_code: string | null
  client_full_name: string | null
  description: string | null
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  status: GoodsStatus
  is_unclaimed: boolean
  is_burning: boolean
  burning_days: number | null
  received_at: string
  shipment_number: string | null
}

export interface WarehouseCounters {
  total: number
  in_china: number
  ready_to_ship: number
  burning: number
  unclaimed: number
}

export interface GoodsReceiveResponse {
  id: number
  client_code: string | null
  client_full_name: string | null
  is_unclaimed: boolean
  description: string | null
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  rate_usd_per_kg: string
  freight_usd: string
  freight_somoni: string
  status: GoodsStatus
  received_at: string
  notified: boolean
}

export type DensityGroup = 'dense' | 'medium' | 'light'

export type PlanReason =
  | 'burning' | 'quota' | 'topup' | 'manual' | 'excluded'

export interface PlanGoodsRow {
  id: number
  client_code: string | null
  client_full_name: string | null
  description: string | null
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  density_group: DensityGroup
  rate_usd_per_kg: string
  freight_usd: string
  received_at: string
  age_days: number
  is_burning: boolean
  reason: PlanReason
}

export interface PlanGateStatus {
  ok: boolean
  label: string
  detail: string
}

export interface PlanGroupStats {
  volume_m3: string
  weight_kg: string
  quota_m3: string
  quota_pct: number
  count: number
}

export interface PlanResponse {
  warehouse_id: number
  warehouse_name: string
  truck_volume_m3: string
  truck_weight_kg: string
  target_cost_usd: string
  fill_target_pct: number
  burning_days_threshold: number
  total_volume_m3: string
  total_weight_kg: string
  total_cost_usd: string
  fill_pct: string
  gate_fill: PlanGateStatus
  gate_cost: PlanGateStatus
  gate_weight: PlanGateStatus
  is_ready: boolean
  groups: Record<DensityGroup, PlanGroupStats>
  selected: PlanGoodsRow[]
  left_behind: PlanGoodsRow[]
}

export type ShipmentStatus =
  | 'draft' | 'in_transit' | 'arrived' | 'closed'

export interface ShipmentListRow {
  id: number
  number: string
  status: ShipmentStatus
  goods_count: number
  total_volume_m3: string
  total_weight_kg: string
  total_cost_usd: string
  fill_pct: string | null
  departed_at: string | null
  arrived_at: string | null
  created_at: string
}

export interface ShipmentGoodsRow {
  id: number
  client_code: string | null
  client_full_name: string | null
  description: string | null
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  freight_usd: string
  status: GoodsStatus
  received_at: string
}

export interface ShipmentDetail {
  id: number
  number: string
  warehouse_id: number
  warehouse_name: string
  status: ShipmentStatus
  truck_volume_m3: string | null
  truck_weight_kg: string | null
  total_volume_m3: string
  total_weight_kg: string
  total_cost_usd: string
  fill_pct: string | null
  note: string | null
  departed_at: string | null
  arrived_at: string | null
  created_at: string
  goods: ShipmentGoodsRow[]
}

export interface WaybillListRow {
  id: number
  number: string
  warehouse_id: number
  warehouse_name: string
  status: 'in_transit' | 'arrived'
  goods_count: number
  received_count: number
  missing_count: number
  total_weight_kg: string
  total_volume_m3: string
  departed_at: string | null
  arrived_at: string | null
}

export interface WaybillGoodsRow {
  id: number
  client_code: string | null
  client_full_name: string | null
  description: string | null
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  status: GoodsStatus
  is_missing: boolean
  is_unclaimed: boolean
  received_at: string
}

export interface WaybillDetail {
  id: number
  number: string
  warehouse_id: number
  warehouse_name: string
  status: 'in_transit' | 'arrived'
  total_weight_kg: string
  total_volume_m3: string
  total_cost_usd: string
  departed_at: string | null
  arrived_at: string | null
  note: string | null
  goods: WaybillGoodsRow[]
}

export interface ReceiveResponse {
  shipment_id: number
  status: 'in_transit' | 'arrived'
  received_count: number
  missing_count: number
  notified_count: number
}

export interface DeliveryGoodsRow {
  id: number
  description: string | null
  warehouse_name: string
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  freight_somoni: string
  storage_days: number
  storage_paid_days: number
  storage_fee_somoni: string
  arrived_in_dushanbe_at: string | null
  shipment_number: string | null
}

export interface DeliveryPreview {
  client_id: number
  client_code: string
  client_full_name: string
  phone: string
  telegram_verified: boolean
  goods: DeliveryGoodsRow[]
  total_freight_somoni: string
  total_storage_somoni: string
  total_to_pay_somoni: string
  exchange_rate: string
  free_storage_days: number
  storage_daily_coef_somoni: string
}

export interface DeliveryConfirmResponse {
  client_code: string
  delivered_count: number
  total_paid_somoni: string
  payment_status: 'paid' | 'debt'
  delivered_at: string
}

export interface TariffRowFull {
  id: number
  density_from: string
  density_to: string | null
  rate_usd_per_kg: string
}

export interface TariffFull {
  id: number
  warehouse_id: number
  warehouse_name: string
  currency: string
  is_active: boolean
  effective_from: string
  note: string | null
  created_at: string
  rows: TariffRowFull[]
}

export interface TariffRowIn {
  density_from: number
  density_to: number | null
  rate_usd_per_kg: number
}

export interface DebtRow {
  client_id: number
  client_code: string
  client_full_name: string
  phone: string
  telegram_verified: boolean
  delivered_at: string
  goods_count: number
  freight_somoni: string
  storage_somoni: string
  total_somoni: string
  payment_status: 'paid' | 'debt'
}

export interface PaymentSummary {
  delivered_paid_somoni: string
  delivered_debt_somoni: string
  debt_clients: number
  paid_clients: number
}

export interface DebtsResponse {
  summary: PaymentSummary
  rows: DebtRow[]
  status_filter: 'debt' | 'paid' | 'all'
}

export interface SettleResponse {
  client_code: string
  settled_count: number
  total_somoni: string
}

export interface SettingItem {
  key: string
  value: unknown
  description: string | null
  default: unknown
  kind: 'int' | 'decimal' | 'float'
}

export interface SettingsResponse {
  items: SettingItem[]
}

export interface StaffRow {
  id: number
  email: string
  full_name: string
  role: 'china_staff' | 'dushanbe_staff' | 'owner'
  warehouse_id: number | null
  warehouse_name: string | null
  is_active: boolean
  created_at: string
}

export interface ClientAdminRow {
  id: number
  client_code: string
  full_name: string
  phone: string
  city: string | null
  telegram_status: 'not_started' | 'pending' | 'verified'
  is_active: boolean
  created_at: string
  goods_count: number
  active_goods_count: number
}

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all'

export interface WarehouseStat {
  warehouse_id: number
  warehouse_name: string
  active_goods: number
  burning_goods: number
  unclaimed_goods: number
  shipments_in_period: number
  revenue_somoni: string
}

export interface ShipmentBrief {
  id: number
  number: string
  warehouse_name: string
  status: string
  goods_count: number
  total_cost_usd: string
  fill_pct: string | null
  departed_at: string | null
}

export interface OwnerDashboard {
  period: AnalyticsPeriod
  revenue_somoni: string
  revenue_paid_somoni: string
  revenue_debt_somoni: string
  delivered_count: number
  shipments_count: number
  avg_fill_pct: string | null
  avg_shipment_cost_usd: string | null
  active_goods_total: number
  in_china: number
  in_transit: number
  in_dushanbe: number
  burning_count: number
  unclaimed_count: number
  missing_count: number
  pending_requests: number
  storage_pending_somoni: string
  storage_pending_goods: number
  new_clients_in_period: number
  warehouses: WarehouseStat[]
  recent_shipments: ShipmentBrief[]
}

export interface ClientHistoryItem {
  delivered_at: string
  goods_count: number
  total_freight_somoni: string
  total_storage_somoni: string
  payment_status: 'paid' | 'debt'
}

export interface ClientAnalytics {
  total_delivered_count: number
  total_freight_somoni: string
  total_storage_somoni: string
  total_paid_somoni: string
  total_debt_somoni: string
  active_freight_estimate_somoni: string
  avg_transit_days: number | null
  history: ClientHistoryItem[]
}

export interface GoodsPreview {
  id: number
  client_code: string | null
  client_full_name: string | null
  description: string | null
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  status: GoodsStatus
  warehouse_id: number
  warehouse_name: string
}

export interface ChangeRequestOut {
  id: number
  author_id: number
  author_name: string
  warehouse_id: number | null
  goods_id: number | null
  action: 'edit_goods' | 'delete_goods' | 'other'
  payload: Record<string, unknown>
  status: 'pending' | 'applied' | 'rejected'
  reason: string | null
  created_at: string
  decided_at: string | null
  decision_note: string | null
  goods_preview: GoodsPreview | null
}

export interface UnclaimedRow {
  id: number
  warehouse_id: number
  warehouse_name: string
  description: string | null
  weight_kg: string
  volume_m3: string
  density_kg_m3: string
  status: GoodsStatus
  received_at: string
  shipment_number: string | null
}

export interface BindClientResponse {
  goods_id: number
  client_id: number
  client_code: string
  client_full_name: string
  notified: boolean
}
