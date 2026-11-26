import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import {
  createConversation,
  sendChatMessage,
  type ChatMessage,
  type DraftPayload,
  type SourceHit,
} from '../api/chat'
import type { DiagnoseResponse } from '../api/types'
import { fetchEvidence, type ManualSearchHit } from '../api/manuals'
import { SourceDrawer } from './SourceDrawer'
import { TicketDraftCard } from './TicketDraftCard'

interface AgentChatProps {
  vehicleId: string
  sessionId: string
  diagnoseResult?: DiagnoseResponse | null
}

const SUGGESTIONS = [
  'Объясни результат диагностики и что делать дальше',
  'Найди процедуру проверки по руководству',
  'Подготовь черновик заявки с источниками',
]

export function AgentChat({ vehicleId, sessionId, diagnoseResult }: AgentChatProps) {
  const contextKey = useMemo(() => `${vehicleId}:${sessionId}`, [vehicleId, sessionId])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftPayload | null>(null)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [evidenceHit, setEvidenceHit] = useState<ManualSearchHit | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setConversationId(null)
    setMessages([])
    setDraft(null)
    setTicketId(null)
    setError(null)
    setEvidenceHit(null)

    if (!vehicleId || !sessionId) return

    createConversation(vehicleId, sessionId)
      .then((conv) => {
        if (!cancelled) setConversationId(conv.conversation_id)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось открыть чат')
        }
      })

    return () => {
      cancelled = true
    }
  }, [contextKey, vehicleId, sessionId])

  const send = async (text: string) => {
    if (!conversationId || !text.trim()) return
    setLoading(true)
    setError(null)
    setDraft(null)
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    try {
      const reply = await sendChatMessage(conversationId, text.trim())
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply.reply,
        sources: reply.sources,
      }
      setMessages((prev) => [...prev, assistantMsg])
      if (reply.draft?.draft_id && reply.draft.confirm_nonce) {
        setDraft(reply.draft)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка агента')
    } finally {
      setLoading(false)
    }
  }

  const openEvidence = async (hit: SourceHit) => {
    if (hit.doc_id) {
      setEvidenceHit({
        evidence_id: hit.evidence_id,
        doc_id: hit.doc_id,
        manual_title: hit.manual_title,
        pdf_page: hit.pdf_page,
        quote: hit.quote,
        score: 0,
        extraction: 'rag',
      })
      return
    }
    setEvidenceLoading(true)
    try {
      const row = await fetchEvidence(hit.evidence_id)
      setEvidenceHit({ ...row, score: 'score' in row ? Number(row.score) || 0 : 0 })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть источник')
    } finally {
      setEvidenceLoading(false)
    }
  }

  return (
    <section className="panel chat-panel">
      <div className="panel__title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <MessageSquare size={18} aria-hidden />
        <h2 style={{ margin: 0, font: 'inherit' }}>Чат с цифровым механиком</h2>
      </div>
      <p className="panel__subtitle">
        Агент выбирает инструменты: диагностика, руководства, история, черновик заявки.
        {diagnoseResult ? ` Текущий статус ML: ${diagnoseResult.status}.` : ''}
      </p>

      <div className="chip-row">
        {SUGGESTIONS.map((item) => (
          <button
            key={item}
            type="button"
            className="chip-button"
            disabled={loading || !conversationId}
            onClick={() => void send(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="chat-log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="panel__subtitle" style={{ margin: 0 }}>
            Задайте вопрос по выбранной машине и сессии.
          </p>
        ) : null}
        {messages.map((msg) => (
          <article key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
            <p className="chat-bubble__role">{msg.role === 'user' ? 'Вы' : 'Механик'}</p>
            <p className="chat-bubble__text">{msg.content}</p>
            {msg.sources?.length ? (
              <ul className="chat-sources">
                {msg.sources.map((s) => (
                  <li key={s.evidence_id}>
                    <button
                      type="button"
                      className="chat-source-link"
                      disabled={evidenceLoading}
                      onClick={() => void openEvidence(s)}
                    >
                      {s.manual_title}, PDF {s.pdf_page}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
        {loading ? <p className="panel__subtitle">Агент обрабатывает запрос…</p> : null}
      </div>

      {error ? <p className="panel__error">{error}</p> : null}

      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Вопрос или команда механика…"
          rows={3}
          disabled={loading || !conversationId}
        />
        <button type="submit" className="btn btn--primary" disabled={loading || !conversationId || !input.trim()}>
          <Send size={18} aria-hidden />
          Отправить
        </button>
      </form>

      <TicketDraftCard draft={draft} onConfirmed={(id) => setTicketId(id)} />
      {ticketId ? <p className="ticket-draft__ok">Номер заявки: {ticketId}</p> : null}

      <SourceDrawer hit={evidenceHit} onClose={() => setEvidenceHit(null)} />
    </section>
  )
}