import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, MessageSquare, Send } from 'lucide-react'
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
import { CopyButton } from './CopyButton'
import { manualTopic, usableStatus, type ChatIntent } from '../lib/workflow'
import { resolveErrorMessage } from '../lib/i18nError'

interface AgentChatProps {
  vehicleId: string
  sessionId: string
  diagnoseResult?: DiagnoseResponse | null
  onDiagnoseCommand?: () => void
  chatIntent?: ChatIntent | null
  onIntentHandled?: (id: number) => void
  onOpenManuals?: (query: string) => void
}

const SUGGESTION_KEYS: TranslationKey[] = ['chat.suggest1', 'chat.suggest2', 'chat.suggest3']

function isDiagnoseVoiceCommand(text: string): boolean {
  const q = text.toLowerCase()
  return /диагност|diagnost|tekshir|талда|निदान|নির্ণয়/.test(q)
}

export function AgentChat({ vehicleId, sessionId, diagnoseResult, onDiagnoseCommand, chatIntent, onIntentHandled, onOpenManuals }: AgentChatProps) {
  const { locale, t } = useI18n()
  const contextKey = `${vehicleId}:${sessionId}`
  const contextRef = useRef(contextKey)
  const sendGen = useRef(0)
  const evidenceGen = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const handledIntent = useRef<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const tRef = useRef(t)
  tRef.current = t

  const [conversationRetry, setConversationRetry] = useState(0)
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
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages, draft, ticketId, loading])

  const status = diagnoseResult ? usableStatus(diagnoseResult) : null
  const prefill = (text: string) => {
    setInput((prev) => prev.includes(text) ? prev : prev.trim() ? `${prev}\n\n${text}` : text)
    inputRef.current?.scrollIntoView({ block: 'nearest' })
    inputRef.current?.focus()
  }
  useEffect(() => {
    if (!chatIntent || chatIntent.id === handledIntent.current || chatIntent.vehicleId !== vehicleId || chatIntent.sessionId !== sessionId) return
    handledIntent.current = chatIntent.id
    prefill(chatIntent.text)
    onIntentHandled?.(chatIntent.id)
  }, [chatIntent, vehicleId, sessionId, onIntentHandled])

  const statusLine = useMemo(() => {
    if (!diagnoseResult) return t('chat.contextEmpty')
    if (status === 'normal') return t('chat.status.normal')
    if (status === 'anomaly') return t('chat.status.anomaly')
    return t('chat.status.check_failed')
  }, [diagnoseResult, status, t])

  useEffect(() => {
    if (!diagnoseResult) return
    const id = `ml:${diagnoseResult.vehicle_id}:${diagnoseResult.session_id}:${diagnoseResult.status}`
    const statusKey =
      status === 'normal'
        ? 'chat.status.normal'
        : status === 'anomaly'
          ? 'chat.status.anomaly'
          : 'chat.status.check_failed'
    const lines = [
      t(statusKey),
      diagnoseResult.engine_model ? `${t('verdict.engine')}: ${diagnoseResult.engine_model}` : '',
      status === 'check_failed' ? t('verdict.failed.action') : '',
      status === 'anomaly' && diagnoseResult.anomaly_title
        ? `${t('verdict.type')}: ${diagnoseResult.anomaly_type} — ${diagnoseResult.anomaly_title}`
        : '',
      status !== 'check_failed' && diagnoseResult.confidence != null
        ? `${t('verdict.confidence')}: ${diagnoseResult.confidence}`
        : '',
    ].filter(Boolean)
    setMessages((prev) => {
      const rest = prev.filter((msg) => !msg.id.startsWith('ml:'))
      return [...rest, { id, role: 'assistant', content: lines.join('\n') }]
    })
  }, [diagnoseResult, status, t])

  useEffect(() => {
    contextRef.current = contextKey
    const epoch = ++sendGen.current
    setConversationId(null)
    setDraft(null)
    setTicketId(null)
    setError(null)
    setEvidenceHit(null)
    setLoading(false)

    if (!vehicleId || !sessionId) return

    const timer = window.setTimeout(() => { void createConversation(vehicleId, sessionId)
      .then((conv) => {
        if (epoch !== sendGen.current || contextRef.current !== contextKey) return
        setConversationId(conv.conversation_id)
      })
      .catch((err: unknown) => {
        if (epoch !== sendGen.current || contextRef.current !== contextKey) return
        setError(resolveErrorMessage(tRef.current, err, 'error.chatOpen'))
      }) }, 0)
    return () => { window.clearTimeout(timer); sendGen.current += 1; evidenceGen.current += 1 }
  }, [contextKey, vehicleId, sessionId, conversationRetry])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!conversationId || !trimmed || loading) return
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
      setError(resolveErrorMessage(tRef.current, err, 'error.agent'))
      setMessages((prev) => prev.filter((msg) => msg.id !== userMsg.id))
      setInput((prev) => prev.trim() ? `${trimmed}\n\n${prev}` : trimmed)
    } finally {
      if (epoch === sendGen.current && contextRef.current === key) setLoading(false)
    }
  }

  const openEvidence = async (hit: SourceHit) => {
    const key = contextKey
    const epoch = ++evidenceGen.current
    if (hit.doc_id) {
      setEvidenceLoading(false)
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
      if (epoch !== evidenceGen.current || contextRef.current !== key) return
      setEvidenceHit({ ...row, score: 'score' in row ? Number(row.score) || 0 : 0 })
    } catch (err: unknown) {
      if (epoch !== evidenceGen.current || contextRef.current !== key) return
      setError(resolveErrorMessage(tRef.current, err, 'error.source'))
    } finally {
      if (epoch === evidenceGen.current && contextRef.current === key) setEvidenceLoading(false)
    }
  }

  const onVoiceText = (text: string) => {
    setInput(text)
    if (isDiagnoseVoiceCommand(text)) onDiagnoseCommand?.()
  }

  return (
    <section className="chat-panel">
      <div className="chat-panel__head">
        <MessageSquare size={18} aria-hidden />
        <div>
          <h2 className="chat-panel__title">{t('chat.title')}</h2>
          <p className="chat-panel__status">{statusLine}</p>
        </div>
      </div>

      <div className="chip-row">
        {SUGGESTION_KEYS.filter((key) => key !== 'chat.suggest3' || status === 'anomaly').map((key) => (
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

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 ? <p className="panel__subtitle chat-empty">{t('chat.empty')}</p> : null}
        {messages.map((msg) => (
          <article key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
            <p className="chat-bubble__role">{msg.role === 'user' ? t('chat.roleUser') : t('chat.roleAgent')}</p>
            <p className="chat-bubble__text">{msg.content}</p>
            {msg.sources?.length ? (
              <details className="evidence-panel" open>
                <summary>{t('source.eyebrow')}</summary>
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
              </details>
            ) : null}
            {msg.role === 'assistant' && !msg.id.startsWith('ml:') && msg.id === messages.filter((m) => m.role === 'assistant' && !m.id.startsWith('ml:')).at(-1)?.id ? (
              <div className="message-actions">
                <CopyButton key={msg.id} text={[msg.content, ...(msg.sources ?? []).map((source) => `${source.manual_title}, ${t('ticket.pdfPage')} ${source.pdf_page}`)].join('\n')} />
                <button type="button" className="btn btn--secondary" disabled={loading} onClick={() => prefill(t(status === 'check_failed' ? 'action.askFailed' : 'action.askPlan'))}><MessageSquare size={16} />{t('action.followUp')}</button>
                {onOpenManuals && status !== 'check_failed' ? <button type="button" className="btn btn--secondary" onClick={() => onOpenManuals(manualTopic(diagnoseResult))}><BookOpen size={16} />{t('nav.manuals')}</button> : null}
              </div>
            ) : null}
          </article>
        ))}
        <TicketDraftCard draft={status === 'check_failed' ? null : draft} sources={messages.flatMap((m) => m.sources ?? [])} onOpenSource={(source) => void openEvidence(source)} onConfirmed={(id) => setTicketId(id)} />
        {ticketId ? (
          <p className="ticket-draft__ok">
            {t('ticket.confirmedId')}: {ticketId}
          </p>
        ) : null}
        {loading ? <p className="panel__subtitle">{t('chat.processing')}</p> : null}
      </div>

      {error ? <div role="alert" className="panel__error">{error}{!conversationId ? <button type="button" className="btn btn--secondary" onClick={() => setConversationRetry((n) => n + 1)}>{t('history.retry')}</button> : null}</div> : null}

      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <div className="chat-compose__bar">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('chat.placeholder')}
            rows={2}
            disabled={loading || !conversationId}
          />
          <VoiceCapture disabled={loading || !conversationId} onText={onVoiceText} compact />
          <button type="submit" className="btn btn--primary" disabled={loading || !conversationId || !input.trim()}>
            <Send size={16} aria-hidden />
            {t('chat.send')}
          </button>
        </div>
      </form>


      <SourceDrawer hit={evidenceHit} onClose={() => setEvidenceHit(null)} />
    </section>
  )
}
