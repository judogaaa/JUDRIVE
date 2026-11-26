import { i18nError } from '../lib/i18nError'

export interface TicketSubmission {
  local_id: string
  draft_id: string
  vehicle_id: string
  session_id: string
  ticket_id: string | null
  submit_status: string
  payload_snapshot: string | null
  error_detail: string | null
  created_at: string
}

export async function fetchTickets(vehicleId?: string): Promise<TicketSubmission[]> {
  const query = vehicleId ? `?vehicle_id=${encodeURIComponent(vehicleId)}` : ''
  const response = await fetch(`/api/tickets${query}`)
  if (!response.ok) {
    throw i18nError('error.ticketsJournal', response.status)
  }
  const data = (await response.json()) as { tickets: TicketSubmission[] }
  return data.tickets ?? []
}