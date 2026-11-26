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
}

export async function searchManuals(
  engineModel: string,
  query: string,
  limit = 5,
): Promise<ManualSearchResponse> {
  const response = await fetch('/api/manuals/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine_model: engineModel, query, limit }),
  })
  if (!response.ok) {
    throw i18nError('error.manualSearch', response.status)
  }
  return (await response.json()) as ManualSearchResponse
}

export function pdfSourceUrl(docId: string, page: number): string {
  return `/api/sources/pdf/${encodeURIComponent(docId)}#page=${page}`
}

export type EvidenceRecord = ManualSearchHit

export async function fetchEvidence(evidenceId: string): Promise<EvidenceRecord> {
  const response = await fetch(`/api/sources/evidence/${encodeURIComponent(evidenceId)}`)
  if (!response.ok) {
    throw i18nError('error.evidence', response.status)
  }
  const data = (await response.json()) as EvidenceRecord
  return data
}