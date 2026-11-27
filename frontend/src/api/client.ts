import type { TrendPoint } from './fleet'
import type { ApiErrorBody, DiagnoseResponse, VehicleSummary } from './types'
import { i18nError } from '../lib/i18nError'

const READ_TIMEOUT_MS = 20_000
const DIAGNOSIS_TIMEOUT_MS = 45_000

export class ApiResponseError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiResponseError'
  }
}

async function parseError(response: Response): Promise<never> {
  let detail: string | undefined
  try {
    const body = (await response.json()) as ApiErrorBody
    if (typeof body.detail === 'string' && body.detail.trim()) detail = body.detail
  } catch {
    /* non-JSON gateway/error page */
  }
  throw new ApiResponseError(response.status, detail ?? i18nError('error.http', response.status).message)
}

function timedSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  window.setTimeout(() => controller.abort(), ms)
  return controller.signal
}

async function request(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    const timeoutSignal = timedSignal(timeoutMs)
    const signal =
      init.signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([init.signal, timeoutSignal])
        : init.signal ?? timeoutSignal
    return await fetch(input, { ...init, signal })
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

export async function fetchDiagnosis(vehicleId: string, sessionId: string, signal?: AbortSignal): Promise<DiagnoseResponse> {
  const response = await request(
    '/api/diagnose',
    {
      method: 'POST',
      signal,
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
