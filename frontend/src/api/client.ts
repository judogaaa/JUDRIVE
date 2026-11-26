import type { TrendPoint } from './fleet'
import type { ApiErrorBody, DiagnoseResponse, VehicleSummary } from './types'
import { i18nError } from '../lib/i18nError'

const READ_TIMEOUT_MS = 20_000
const DIAGNOSIS_TIMEOUT_MS = 45_000

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

function timedSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  window.setTimeout(() => controller.abort(), ms)
  return controller.signal
}

async function request(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: init.signal ?? timedSignal(timeoutMs) })
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw i18nError('error.timeout')
    }
    throw i18nError('error.network')
  }
}

export async function fetchVehicles(): Promise<VehicleSummary[]> {
  const response = await request('/api/vehicles', {}, READ_TIMEOUT_MS)
  if (!response.ok) {
    throw await parseError(response)
  }
  const data = (await response.json()) as { vehicles: VehicleSummary[] }
  return data.vehicles
}

export async function fetchVehicleDiagnosisHistory(
  vehicleId: string,
  signal?: AbortSignal,
): Promise<TrendPoint[]> {
  const response = await request(
    `/api/vehicles/${encodeURIComponent(vehicleId)}/diagnosis-history`,
    { signal },
    READ_TIMEOUT_MS,
  )
  if (!response.ok) {
    throw await parseError(response)
  }
  const data = (await response.json()) as { trend_points: TrendPoint[] }
  return data.trend_points ?? []
}

export async function fetchDiagnosis(vehicleId: string, sessionId: string): Promise<DiagnoseResponse> {
  const response = await request(
    '/api/diagnose',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id: vehicleId, session_id: sessionId }),
    },
    DIAGNOSIS_TIMEOUT_MS,
  )
  if (!response.ok) {
    throw await parseError(response)
  }
  return (await response.json()) as DiagnoseResponse
}
