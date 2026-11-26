import { useEffect, useMemo, useState } from 'react'
import {
  createConversation,
  sendChatMessage,
  type ChatMessage,
  type DraftPayload,
  type SourceHit,
} from '../api/chat'
import { TicketDraftCard } from './TicketDraftCard'

interface AgentChatProps {
  vehicleId: string
  sessionId: string
}

const SUGGESTIONS = [
  'Объясни результат диагностики и что делать дальше',
  'Найди процедуру проверки по руководству',
  'Подготовь черновик заявки с источниками',
]

export function AgentChat({ vehicleId, sessionId }: AgentChatProps) {
  const contextKey = useMemo(() => `${vehicleId}:${sessionId}`, [vehicleId, sessionId])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<SourceHit[]>([])
  const [draft, setDraft] = useState<DraftPayload | null>(null)
  const [ticketId, setTicketId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setConversationId(null)
    setMessages([])
    setSources([])
    setDraft(null)
    setTicketId(null)
    setError(null)

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
      if (reply.sources?.length) setSources(reply.sources)
      if (reply.draft?.draft_id && reply.draft.confirm_nonce) {
        setDraft(reply.draft)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка агента')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel chat-panel">
      <h2 className="panel__title">Чат с цифровым механиком</h2>
      <p className="panel__subtitle">
        Агент Groq выбирает инструменты: диагностика, руководства, история, черновик заявки.
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
        {messages.length === 0 ? <p className="chat-empty">Задайте вопрос по выбранной машине и сессии.</p> : null}
        {messages.map((msg) => (
          <article key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
            <p className="chat-bubble__role">{msg.role === 'user' ? 'Вы' : 'Механик'}</p>
            <p className="chat-bubble__text">{msg.content}</p>
            {msg.sources?.length ? (
              <ul className="chat-sources">
                {msg.sources.map((s) => (
                  <li key={s.evidence_id}>
                    {s.manual_title}, PDF {s.pdf_page}: {s.quote.slice(0, 160)}…
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
        {loading ? <p className="chat-loading">Агент обрабатывает запрос…</p> : null}
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
        <button type="submit" className="primary-button" disabled={loading || !conversationId || !input.trim()}>
          Отправить
        </button>
      </form>

      {sources.length > 0 ? (
        <aside className="chat-evidence">
          <h3>Источники в ответе</h3>
          <ul>
            {sources.map((s) => (
              <li key={s.evidence_id}>
                {s.manual_title} · стр. {s.pdf_page}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <TicketDraftCard draft={draft} onConfirmed={(id) => setTicketId(id)} />
      {ticketId ? <p className="ticket-draft__ok">Номер заявки: {ticketId}</p> : null}
    </section>
  )
}