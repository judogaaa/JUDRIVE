import type { DiagnosisAction } from '../lib/workflow'
import { i18nError } from '../lib/i18nError'

export interface Conversation {
  conversation_id: string
  vehicle_id: string
  session_id: string
  engine_model: string
}

export interface SourceHit {
  evidence_id: string
  manual_title: string
  pdf_page: number
  quote: string
  doc_id?: string
}

export interface DraftPayload {
  draft_id: string
  confirm_nonce: string
  signal_quality?: "good" | "warning"
  version: number
  status: string
  payload?: {
    conclusion: string
    urgency: string
    operations: string[]
    spare_parts: string[]
    references: { manual: string; pdf_page: number }[]
    anomaly_type?: string
    vehicle_id?: string
    session_id?: string
  }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceHit[]
  draft_id?: string | null
  tool_trace?: unknown[]
}

export interface ChatReply {
  reply: string
  sources: SourceHit[]
  draft: (DraftPayload & { status?: string; message?: string }) | null
  tool_trace: unknown[]
  usage?: { total_tokens?: number }
}

// Do not expose provider errors, stack traces or request metadata to the user.
async function chatFetch<T>(url: string, options: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, options)
  } catch {
    if (options.signal?.aborted && options.signal.reason?.name === 'AbortError') throw options.signal.reason
    if (options.signal?.reason?.name === 'TimeoutError') throw i18nError('error.timeout')
    throw i18nError('error.agentUnavailable')
  }
  if (!response.ok) {
    throw i18nError(response.status === 429 ? 'error.agentBusy'
      : response.status === 504 ? 'error.timeout'
      : response.status >= 500 ? 'error.agentUnavailable' : 'error.agent')
  }
  try { return await response.json() as T } catch { throw i18nError('error.agentUnavailable') }
}

export async function createConversation(
  vehicleId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<Conversation> {
  const response = await chatFetch<Conversation>('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle_id: vehicleId, session_id: sessionId }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
  })
  if (!response || typeof response.conversation_id !== 'string') throw i18nError('error.agentUnavailable')
  return response
}

export async function sendChatMessage(
  conversationId: string,
  message: string,
  locale = 'ru',
  analysisOnly = false,
  signal?: AbortSignal,
  action?: DiagnosisAction,
  evidenceId?: string,
): Promise<ChatReply> {
  const response = await chatFetch<ChatReply>(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, locale, analysis_only: analysisOnly, action, evidence_id: evidenceId }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
  })
  if (!response || typeof response.reply !== 'string' || !response.reply.trim() || !Array.isArray(response.sources)) throw i18nError('error.agentUnavailable')
  return response
}

export async function confirmTicketDraft(
  draftId: string,
  confirmNonce: string,
  warningAcknowledged = false,
  urgency?: "low" | "medium" | "high",
): Promise<{ status: string; ticket_id?: string; message?: string }> {
  const response = await fetch(`/api/tickets/drafts/${draftId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm_nonce: confirmNonce, acknowledge: true, warning_acknowledged: warningAcknowledged, urgency }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as { status: string; ticket_id?: string; message?: string }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    if (typeof body.detail === 'string') return body.detail
  } catch {
    /* ignore */
  }
  return i18nError('error.http', response.status).message
}