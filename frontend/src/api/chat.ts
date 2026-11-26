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

export async function createConversation(vehicleId: string, sessionId: string): Promise<Conversation> {
  const response = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle_id: vehicleId, session_id: sessionId }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as Conversation
}

export async function sendChatMessage(
  conversationId: string,
  message: string,
  locale = 'ru',
): Promise<ChatReply> {
  const response = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, locale }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as ChatReply
}

export async function confirmTicketDraft(
  draftId: string,
  confirmNonce: string,
): Promise<{ status: string; ticket_id?: string; message?: string }> {
  const response = await fetch(`/api/tickets/drafts/${draftId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm_nonce: confirmNonce, acknowledge: true }),
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
  return `Ошибка (${response.status})`
}