export type DiagnoseStatus = 'normal' | 'anomaly' | 'check_failed'
export type SignalQuality = 'good' | 'warning' | 'bad'

export interface SessionSummary {
  session_id: string
  checked_at: string
}

export interface VehicleSummary {
  vehicle_id: string
  garage_no: string
  make: string
  model: string | null
  vehicle_type: string
  engine_model: string
  fuel: string
  sessions: SessionSummary[]
  latest_session_id?: string | null
  latest_status?: string | null
  latest_signal_quality?: string | null
}

export interface DiagnoseResponse {
  vehicle_id: string
  session_id: string
  status: DiagnoseStatus
  anomaly_type: string | null
  anomaly_title: string | null
  anomaly_score: number | null
  confidence: number | null
  signal_quality: SignalQuality
  description: string
  model_version: string
  review_priority?: 'low' | 'medium' | 'high' | null
  engine_model?: string | null
}

export interface ApiErrorBody {
  detail?: string
}