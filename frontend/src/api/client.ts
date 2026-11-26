import type { TrendPoint } from './fleet'
import type { ApiErrorBody, DiagnoseResponse, VehicleSummary } from './types'
import { i18nError } from '../lib/i18nError'

async function parseError(response: Response): Promise<never> {
  try {
    const body = (await response.json()) as ApiErrorBody
    if (typeof body.detail === 'string') {
      throw new Error(body.detail)
    }
  } catch (err) {
    if (err instanceof Error && !err.message.startsWith('@i18n:')) {
      throw err
    }
  }
  throw i18nError('error.http', response.status)
}

export async function fetchVehicles(): Promise<VehicleSummary[]> {
  const response = await fetch('/api/vehicles')
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  const data = (await response.json()) as { vehicles: VehicleSummary[] }
  return data.vehicles
}

export async function fetchVehicleDiagnosisHistory(vehicleId: string): Promise<TrendPoint[]> {
  const response = await fetch(`/api/vehicles/${encodeURIComponent(vehicleId)}/diagnosis-history`)
  if (!response.ok) {
    throw new Error(await parseError(response))
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
    throw new Error(await parseError(response))
  }
  return (await response.json()) as DiagnoseResponse
}