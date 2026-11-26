import { useEffect, useMemo, useRef, useState } from 'react'
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
  onDiagnoseCommand?: () => void
}

const SUGGESTION_KEYS: TranslationKey[] = ['chat.suggest1', 'chat.suggest2', 'chat.suggest3']

function isDiagnoseVoiceCommand(text: string): boolean {
  const q = text.toLowerCase()
  return /диагност|diagnost|tekshir|талда|निदान|নির্ণয়/.test(q)
}

export function AgentChat({ vehicleId, sessionId, diagnoseResult, onDiagnoseCommand }: AgentChatProps) {
  const { locale, t } = useI18n()
  const contextKey = `${vehicleId}:${sessionId}`
  const contextRef = useRef(contextKey)
  const sendGen = useRef(0)
  const tRef = useRef(t)
  tRef.current = t

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
    contextRef.current = contextKey
    const epoch = ++sendGen.current
    setConversationId(null)
    setMessages([])
    setDraft(null)
    setTicketId(null)
    setError(null)
    setEvidenceHit(null)
    setLoading(false)

    if (!vehicleId || !sessionId) return

    createConversation(vehicleId, sessionId)
      .then((conv) => {
        if (epoch !== sendGen.current || contextRef.current !== contextKey) return
        setConversationId(conv.conversation_id)
      })
      .catch((err: unknown) => {
        if (epoch !== sendGen.current || contextRef.current !== contextKey) return
        setError(err instanceof Error ? err.message : tRef.current('error.chatOpen'))
      })
  }, [contextKey, vehicleId, sessionId])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!conversationId || !trimmed) return
    const epoch = ++sendGen.current
    const key = contextKey
    const convId = conversationId
    setLoading(true)
    setError(null)
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    try {
      const reply = await sendChatMessage(convId, trimmed, locale)
      if (epoch !== sendGen.current || contextRef.current !== key) return
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
      if (epoch !== sendGen.current || contextRef.current !== key) return
      setError(err instanceof Error ? err.message : tRef.current('error.agent'))
    } finally {
      if (epoch === sendGen.current && contextRef.current === key) setLoading(false)
    }
  }

  const openEvidence = async (hit: SourceHit) => {
    const key = contextKey
    const epoch = sendGen.current
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
      if (epoch !== sendGen.current || contextRef.current !== key) return
      setEvidenceHit({ ...row, score: 'score' in row ? Number(row.score) || 0 : 0 })
    } catch (err: unknown) {
      if (epoch !== sendGen.current || contextRef.current !== key) return
      setError(err instanceof Error ? err.message : tRef.current('error.source'))
    } finally {
      if (epoch === sendGen.current && contextRef.current === key) setEvidenceLoading(false)
    }
  }

  const onVoiceText = (text: string) => {
    setInput(text)
    if (isDiagnoseVoiceCommand(text)) onDiagnoseCommand?.()
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
        {messages.length === 0 ? <p className="panel__subtitle chat-empty">{t('chat.empty')}</p> : null}
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
          rows={2}
          disabled={loading || !conversationId}
        />
        <div className="chat-compose__actions">
          <VoiceCapture disabled={loading || !conversationId} onText={onVoiceText} compact />
          <button type="submit" className="btn btn--primary" disabled={loading || !conversationId || !input.trim()}>
            <Send size={16} aria-hidden />
            {t('chat.send')}
          </button>
        </div>
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
