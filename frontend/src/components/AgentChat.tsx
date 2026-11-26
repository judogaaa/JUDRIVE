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
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { SourceDrawer } from './SourceDrawer'
import { TicketDraftCard } from './TicketDraftCard'
import { VoiceCapture } from './VoiceCapture'

interface AgentChatProps {
  vehicleId: string
  sessionId: string
  diagnoseResult?: DiagnoseResponse | null
}

const SUGGESTION_KEYS: TranslationKey[] = ['chat.suggest1', 'chat.suggest2', 'chat.suggest3']

export function AgentChat({ vehicleId, sessionId, diagnoseResult }: AgentChatProps) {
  const { locale, t } = useI18n()
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

  const statusLine = useMemo(() => {
    if (!diagnoseResult) return t('chat.contextEmpty')
    if (diagnoseResult.status === 'normal') return t('chat.status.normal')
    if (diagnoseResult.status === 'anomaly') return t('chat.status.anomaly')
    return t('chat.status.check_failed')
  }, [diagnoseResult, t])

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
          setError(err instanceof Error ? err.message : t('error.chatOpen'))
        }
      })

    return () => {
      cancelled = true
    }
  }, [contextKey, vehicleId, sessionId, t])

  const send = async (text: string) => {
    if (!conversationId || !text.trim()) return
    setLoading(true)
    setError(null)
    setDraft(null)
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    try {
      const reply = await sendChatMessage(conversationId, text.trim(), locale)
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
      setError(err instanceof Error ? err.message : t('error.agent'))
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
      setError(err instanceof Error ? err.message : t('error.source'))
    } finally {
      setEvidenceLoading(false)
    }
  }

  return (
    <section className="panel chat-panel">
      <div className="chat-panel__head">
        <MessageSquare size={18} aria-hidden />
        <div>
          <h2 className="chat-panel__title">{t('chat.title')}</h2>
          <p className="chat-panel__status">{statusLine}</p>
        </div>
      </div>

      <div className="chip-row">
        {SUGGESTION_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="chip-button"
            disabled={loading || !conversationId}
            onClick={() => void send(t(key))}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <div className="chat-log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="panel__subtitle" style={{ margin: 0 }}>
            {t('chat.empty')}
          </p>
        ) : null}
        {messages.map((msg) => (
          <article key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
            <p className="chat-bubble__role">{msg.role === 'user' ? t('chat.roleUser') : t('chat.roleAgent')}</p>
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
                      {s.manual_title}, {t('ticket.pdfPage')} {s.pdf_page}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
        {loading ? <p className="panel__subtitle">{t('chat.processing')}</p> : null}
      </div>

      {error ? <p className="panel__error">{error}</p> : null}

      <VoiceCapture disabled={loading || !conversationId} onText={(text) => setInput(text)} />
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
          placeholder={t('chat.placeholder')}
          rows={3}
          disabled={loading || !conversationId}
        />
        <button type="submit" className="btn btn--primary" disabled={loading || !conversationId || !input.trim()}>
          <Send size={18} aria-hidden />
          {t('chat.send')}
        </button>
      </form>

      <TicketDraftCard draft={draft} onConfirmed={(id) => setTicketId(id)} />
      {ticketId ? (
        <p className="ticket-draft__ok">
          {t('ticket.confirmedId')}: {ticketId}
        </p>
      ) : null}

      <SourceDrawer hit={evidenceHit} onClose={() => setEvidenceHit(null)} />
    </section>
  )
}