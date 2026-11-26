import type { ApiErrorBody, DiagnoseResponse, VehicleSummary } from './types'

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    if (typeof body.detail === 'string') {
      return body.detail
    }
  } catch {
    /* ignore */
  }
  return `Ошибка сервера (${response.status})`
}

export async function fetchVehicles(): Promise<VehicleSummary[]> {
  const response = await fetch('/api/vehicles')
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  const data = (await response.json()) as { vehicles: VehicleSummary[] }
  return data.vehicles
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