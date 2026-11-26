import type { TrendPoint } from './fleet'
import type { ApiErrorBody, DiagnoseResponse, VehicleSummary } from './types'
import { i18nError } from '../lib/i18nError'

async function parseError(response: Response): Promise<never> {
  let body: ApiErrorBody | undefined
  try {
    body = (await response.json()) as ApiErrorBody
  } catch {
    // Proxies and stopped backends sometimes return plain text or HTML instead of JSON.
  }
  if (typeof body?.detail === 'string' && body.detail !== 'Not Found') throw new Error(body.detail)
  throw i18nError('error.http', response.status)
}

export async function fetchVehicles(): Promise<VehicleSummary[]> {
  const response = await fetch('/api/vehicles')
  if (!response.ok) {
    return parseError(response)
  }
  const data = (await response.json()) as { vehicles: VehicleSummary[] }
  return data.vehicles
}

export async function fetchVehicleDiagnosisHistory(vehicleId: string): Promise<TrendPoint[]> {
  const response = await fetch(`/api/vehicles/${encodeURIComponent(vehicleId)}/diagnosis-history`)
  if (!response.ok) {
    return parseError(response)
  }
  const data = (await response.json()) as { trend_points: TrendPoint[] }
  return data.trend_points ?? []
}

export async function fetchDiagnosis(
  vehicleId: string,
  sessionId: string,
): Promise<DiagnoseResponse> {
  const response = await fetch('/api/diagnose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle_id: vehicleId, session_id: sessionId }),
  })
  if (!response.ok) {
    return parseError(response)
  }
  return (await response.json()) as DiagnoseResponse
}