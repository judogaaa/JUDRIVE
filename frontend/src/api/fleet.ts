import { i18nError } from '../lib/i18nError'

export interface EarlyWarning {
  code: string
  message: string
}

export interface VehicleFleetRow {
  vehicle_id: string
  garage_no: string
  make: string
  model: string | null
  vehicle_type: string
  engine_model: string
  category: 'normal' | 'attention' | 'quarantine'
  priority_score: number
  urgency_band: 'low' | 'medium' | 'high' | null
  latest_session_id: string
  latest_checked_at: string
  latest_status: string
  signal_quality: string
  anomaly_type: string | null
  anomaly_title: string | null
  anomaly_score: number | null
  confidence: number | null
  category_reason: string
  needs_rerecord: boolean
  quarantine_basis: string | null
  quarantine_confirmed: boolean
  early_warnings: EarlyWarning[]
  ticket_id: string | null
}

export interface FleetSessionStats {
  total_sessions: number
  by_status: Record<string, number>
  by_signal_quality: Record<string, number>
  by_engine_model: Record<string, number>
  by_anomaly_type: Record<string, number>
  latest_by_status: Record<string, number>
}

export interface FleetDashboard {
  synthetic: boolean
  vehicle_count: number
  session_stats: FleetSessionStats
  summary: Record<string, number>
  priority_queue: VehicleFleetRow[]
  vehicles: VehicleFleetRow[]
  early_warnings_fleet: { vehicle_id: string; code: string; message: string }[]
  engine_models: string[]
  vehicle_types: string[]
}

export interface TrendPoint {
  session_id: string
  checked_at: string
  status: string
  anomaly_score: number | null
  anomaly_type: string | null
  skipped?: boolean
}

export interface VehicleInsight {
  vehicle: VehicleFleetRow
  history: {
    session_id: string
    checked_at: string
    status: string
    signal_quality: string
    anomaly_type: string | null
    anomaly_title: string | null
    anomaly_score: number | null
    confidence: number | null
  }[]
  trend_points: TrendPoint[]
  sessions_total: number
}

export interface FleetDashboardFilters {
  category?: string
  engine_model?: string
  vehicle_type?: string
  q?: string
}

export async function fetchFleetDashboard(filters: FleetDashboardFilters = {}): Promise<FleetDashboard> {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.engine_model) params.set('engine_model', filters.engine_model)
  if (filters.vehicle_type) params.set('vehicle_type', filters.vehicle_type)
  if (filters.q) params.set('q', filters.q)
  const query = params.toString()
  const response = await fetch(`/api/fleet/dashboard${query ? `?${query}` : ''}`, { credentials: 'include' })
  if (!response.ok) throw i18nError('error.dashboardHttp', response.status)
  return (await response.json()) as FleetDashboard
}

export async function fetchVehicleInsight(vehicleId: string): Promise<VehicleInsight> {
  const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/insight`, {
    credentials: 'include',
  })
  if (!response.ok) throw i18nError('error.insight', response.status)
  return (await response.json()) as VehicleInsight
}

export async function setQuarantineRecommendation(
  vehicleId: string, sessionId: string, active: boolean, reason: string,
): Promise<VehicleInsight> {
  const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/quarantine-recommendation`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, active, reason, acknowledge: true }),
  })
  if (!response.ok) throw i18nError('error.insight', response.status)
  return (await response.json()) as VehicleInsight
}
