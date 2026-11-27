import { i18nError } from '../lib/i18nError'

export interface ManualSearchHit {
  evidence_id: string
  doc_id: string
  manual_title: string
  pdf_page: number
  quote: string
  score: number
  extraction: string
}

export interface ManualSearchResponse {
  status: string
  engine_model?: string
  query?: string
  message?: string
  results: ManualSearchHit[]
  conflicting_sources?: ManualSearchHit[]
}

export async function searchManuals(
  engineModel: string,
  query: string,
  limit = 8,
  signal?: AbortSignal,
  scope?: Pick<DocumentScope, 'vehicleId' | 'sessionId'>,
): Promise<ManualSearchResponse> {
  const response = await fetch('/api/manuals/search', {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine_model: engineModel, query, limit, vehicle_id: scope?.vehicleId, session_id: scope?.sessionId }),
  })
  if (!response.ok) {
    throw i18nError('error.manualSearch', response.status)
  }
  return (await response.json()) as ManualSearchResponse
}

export type DocumentScope = { engineModel: string; vehicleId?: string; sessionId?: string }

function scopeQuery(scope: DocumentScope): string {
  const params = new URLSearchParams({ engine_model: scope.engineModel })
  if (scope.vehicleId && scope.sessionId) {
    params.set('vehicle_id', scope.vehicleId)
    params.set('session_id', scope.sessionId)
  }
  return params.toString()
}

export function pdfSourceUrl(docId: string, page: number, scope: DocumentScope): string {
  return `${pdfDocUrl(docId, scope)}#page=${page}`
}

export function pdfDocUrl(docId: string, scope: DocumentScope): string {
  return `/api/sources/pdf/${encodeURIComponent(docId)}?${scopeQuery(scope)}`
}

export type EvidenceRecord = ManualSearchHit

export async function fetchEvidence(evidenceId: string, scope: DocumentScope): Promise<EvidenceRecord> {
  const response = await fetch(`/api/sources/evidence/${encodeURIComponent(evidenceId)}?${scopeQuery(scope)}`)
  if (!response.ok) {
    throw i18nError('error.evidence', response.status)
  }
  const data = (await response.json()) as EvidenceRecord
  return data
}