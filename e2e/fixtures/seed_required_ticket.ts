import { request } from '@playwright/test'
import assert from 'node:assert/strict'

/** Prepare the genuine C1 ticket through our API + real RAG/ML/TOiR + local LLM stub. */
export default async function seedRequiredTicket() {
  const api = await request.newContext({ baseURL: 'http://127.0.0.1:8091', timeout: 120_000 })
  try {
    const pair = { vehicle_id: 'B418HK98', session_id: 'S-0009' }
    const created = await api.post('/api/conversations', { data: pair })
    assert.equal(created.status(), 200)
    const { conversation_id } = await created.json()
    const message = await api.post(`/api/conversations/${conversation_id}/messages`, {
      data: { message: 'Подготовить заявку по клапанному механизму с источниками', locale: 'ru' },
    })
    assert.equal(message.status(), 200)
    const { draft } = await message.json()
    assert.ok(draft?.draft_id && draft?.confirm_nonce, 'C1 requires a grounded draft')
    assert.ok(draft.payload.references.some((ref: { manual: string; pdf_page: number }) =>
      ref.manual === '236-3902150-Б РЭ' && [33, 34].includes(ref.pdf_page)), 'C1 requires the applicable manual page 33–34')
    const confirm = await api.post(`/api/tickets/drafts/${draft.draft_id}/confirm`, {
      data: { acknowledge: true, confirm_nonce: draft.confirm_nonce },
    })
    const result = await confirm.json()
    assert.equal(result.status, 'created', JSON.stringify(result))
    assert.match(result.ticket_id, /^TKT-/)
    console.log('C1 isolated fixture: real Mock TOiR ticket, RAG PDF 33/34 (LLM stub)')
  } finally {
    await api.dispose()
  }
}
