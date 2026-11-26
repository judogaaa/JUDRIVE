import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Loader2, MessageSquare, RotateCcw, Send, X } from 'lucide-react'
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
import { resolveErrorMessage } from '../lib/i18nError'
import { SourceDrawer } from './SourceDrawer'
import { TicketDraftCard } from './TicketDraftCard'
import { VoiceCapture } from './VoiceCapture'
import { CopyButton } from './CopyButton'
import { MessageText, readableAnswer } from './MessageText'
import { manualTopic, usableStatus, type ChatIntent } from '../lib/workflow'

interface AgentChatProps {
  vehicleId: string
  sessionId: string
  diagnoseResult?: DiagnoseResponse | null
  onDiagnoseCommand?: () => void
  chatIntent?: ChatIntent | null
  onChatIntentConsumed?: () => void
  onOpenManuals?: (query: string) => void
}

const SUGGESTION_KEYS: TranslationKey[] = ['chat.suggest1', 'chat.suggest2', 'chat.suggest3']

function isDiagnoseVoiceCommand(text: string): boolean {
  const q = text.toLowerCase()
  return /диагност|diagnost|tekshir|талда|निदान|নির্ণয়/.test(q)
}

export function AgentChat({
  vehicleId,
  sessionId,
  diagnoseResult,
  onDiagnoseCommand,
  chatIntent,
  onChatIntentConsumed,
  onOpenManuals,
}: AgentChatProps) {
  const { locale, t } = useI18n()
  const contextKey = `${vehicleId}:${sessionId}`
  const contextRef = useRef(contextKey)
  const logRef = useRef<HTMLDivElement | null>(null)
  const sendGen = useRef(0)
  const sendingRef = useRef(false)
  const sendAbortRef = useRef<AbortController | null>(null)
  const chatIntentRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const tRef = useRef(t)
  tRef.current = t

  const [conversationRetry, setConversationRetry] = useState(0)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryText, setRetryText] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftPayload | null>(null)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [evidenceHit, setEvidenceHit] = useState<ManualSearchHit | null>(null)
  const [sourceLoadingId, setSourceLoadingId] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)

  // Never show a verdict from another vehicle/session, even for one render.
  const activeResult =
    diagnoseResult &&
    diagnoseResult.vehicle_id === vehicleId &&
    diagnoseResult.session_id === sessionId
      ? diagnoseResult
      : null

  const status = activeResult ? usableStatus(activeResult) : null

  const prefill = (text: string) => {
    setInput((prev) => (prev.includes(text) ? prev : prev.trim() ? `${prev}\n\n${text}` : text))
    inputRef.current?.focus()
  }

  const statusLine = useMemo(() => {
    if (!activeResult) return t('chat.contextEmpty')
    if (status === 'normal') return t('chat.status.normal')
    if (status === 'anomaly') return t('chat.status.anomaly')
    return t('chat.status.check_failed')
  }, [activeResult, status, t])

  useEffect(() => {
    const log = logRef.current
    if (!log) return
    log.scrollTop = log.scrollHeight
  }, [messages, loading])

  useEffect(() => {
    if (!activeResult) return
    const id = `ml:${activeResult.vehicle_id}:${activeResult.session_id}:${activeResult.status}`
    const statusKey =
      status === 'normal'
        ? 'chat.status.normal'
        : status === 'anomaly'
          ? 'chat.status.anomaly'
          : 'chat.status.check_failed'
    const lines = [
      t(statusKey),
      activeResult.engine_model ? `${t('verdict.engine')}: ${activeResult.engine_model}` : '',
      status === 'check_failed' ? t('verdict.failed.action') : '',
      status === 'anomaly' && activeResult.anomaly_title
        ? `${t('verdict.type')}: ${activeResult.anomaly_type} — ${activeResult.anomaly_title}`
        : '',
      status !== 'check_failed' && activeResult.confidence != null
        ? `${t('verdict.confidence')}: ${activeResult.confidence}`
        : '',
    ].filter(Boolean)
    setMessages((prev) => {
      const rest = prev.filter((message) => !message.id.startsWith('ml:'))
      return [...rest, { id, role: 'assistant', content: lines.join('\n') }]
    })
  }, [activeResult, status, t])

  useEffect(() => {
    contextRef.current = contextKey
    const epoch = ++sendGen.current
    sendAbortRef.current?.abort()
    sendAbortRef.current = null
    sendingRef.current = false
    setConversationId(null)
    setMessages([])
    setInput('')
    setLoading(false)
    setError(null)
    setRetryText(null)
    setDraft(null)
    setTicketId(null)
    setEvidenceHit(null)
    setSourceLoadingId(null)
    setSourceError(null)

    if (!vehicleId || !sessionId) return
    const controller = new AbortController()
    createConversation(vehicleId, sessionId, controller.signal)
      .then((conversation) => {
        if (epoch !== sendGen.current || contextRef.current !== contextKey) return
        setConversationId(conversation.conversation_id)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (epoch !== sendGen.current || contextRef.current !== contextKey) return
        setError(resolveErrorMessage(tRef.current, err, 'error.chatOpen'))
      })
    return () => controller.abort()
  }, [contextKey, vehicleId, sessionId, conversationRetry])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (!conversationId) {
        setInput((prev) => (prev.trim() ? prev : trimmed))
        setError(tRef.current('error.chatOpen'))
        return
      }
      if (sendingRef.current) {
        setInput((prev) => (prev.trim() ? prev : trimmed))
        return
      }

      const epoch = ++sendGen.current
      const key = contextKey
      const convId = conversationId
      const controller = new AbortController()
      sendAbortRef.current = controller
      sendingRef.current = true
      setLoading(true)
      setError(null)
      setRetryText(null)
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
      setMessages((prev) => [...prev, userMsg])
      setInput('')

      try {
        const reply = await sendChatMessage(convId, trimmed, locale, false, controller.signal)
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
        if (controller.signal.aborted) return
        if (epoch !== sendGen.current || contextRef.current !== key) return
        setMessages((prev) => prev.filter((message) => message.id !== userMsg.id))
        setError(resolveErrorMessage(tRef.current, err, 'error.agent'))
        setRetryText(trimmed)
        setInput((prev) => (prev.trim() ? prev : trimmed))
      } finally {
        if (epoch === sendGen.current && contextRef.current === key) {
          sendingRef.current = false
          setLoading(false)
        }
      }
    },
    [contextKey, conversationId, locale],
  )

  useEffect(() => {
    if (!chatIntent || chatIntent.vehicleId !== vehicleId || chatIntent.sessionId !== sessionId) return
    if (!conversationId) return
    if (chatIntentRef.current === chatIntent.id) return
    chatIntentRef.current = chatIntent.id
    if (chatIntent.autoSend && !loading) void send(chatIntent.message)
    else prefill(chatIntent.message)
    onChatIntentConsumed?.()
  }, [chatIntent, conversationId, loading, onChatIntentConsumed, send, sessionId, vehicleId])

  const openEvidence = async (hit: SourceHit) => {
    const key = contextKey
    setSourceError(null)
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
    setSourceLoadingId(hit.evidence_id)
    try {
      const row = await fetchEvidence(hit.evidence_id)
      if (contextRef.current !== key) return
      setEvidenceHit({ ...row, score: 'score' in row ? Number(row.score) || 0 : 0 })
    } catch (err: unknown) {
      if (contextRef.current !== key) return
      setSourceError(tRef.current('error.source'))
    } finally {
      if (contextRef.current === key) setSourceLoadingId(null)
    }
  }

  const onVoiceText = (text: string) => {
    setInput((prev) => (prev.trim() ? `${prev}\n${text}` : text))
    if (isDiagnoseVoiceCommand(text)) onDiagnoseCommand?.()
  }

  const lastAssistantId = messages.filter((message) => message.role === 'assistant' && !message.id.startsWith('ml:')).at(-1)?.id

  return (
    <section className="chat-panel">
      <div className="chat-panel__head">
        <span className="chat-panel__icon" aria-hidden>
          <MessageSquare size={18} />
        </span>
        <div>
          <h2 className="chat-panel__title">{t('chat.title')}</h2>
          <p className="chat-panel__status">{statusLine}</p>
        </div>
      </div>

      <div className="chip-row chat-suggestions">
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
        {messages.map((message) => (
          <article key={message.id} className={`chat-bubble chat-bubble--${message.role}`}>
            <p className="chat-bubble__role">{message.role === 'user' ? t('chat.roleUser') : t('chat.roleAgent')}</p>
            <MessageText text={message.content} sources={message.sources} onOpenSource={(source) => void openEvidence(source)} loadingSourceId={sourceLoadingId} />
            {message.sources?.length ? (
              <details className="evidence-panel" open>
                <summary>{t('chat.sourcesTitle')} ({message.sources.length})</summary>
                <ul className="chat-sources">
                  {message.sources.map((source) => (
                    <li key={source.evidence_id}>
                      <button
                        type="button"
                        className="chat-source-link"
                        disabled={sourceLoadingId === source.evidence_id}
                        onClick={() => void openEvidence(source)}
                      >
                        {sourceLoadingId === source.evidence_id ? <Loader2 size={14} className="spin-slow" aria-hidden /> : null}
                        {source.manual_title}, {t('ticket.pdfPage')} {source.pdf_page}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {message.role === 'assistant' && !message.id.startsWith('ml:') && message.id === lastAssistantId ? (
              <div className="message-actions">
                <CopyButton
                  text={[
                    readableAnswer(message.content, message.sources ?? [], t('ticket.pdfPage')),
                    ...(message.sources ?? []).map(
                      (source) => `${source.manual_title}, ${t('ticket.pdfPage')} ${source.pdf_page}`,
                    ),
                  ].join('\n')}
                />
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => prefill(t(status === 'check_failed' ? 'action.askFailed' : 'action.askPlan'))}
                >
                  <MessageSquare size={16} aria-hidden />
                  {t('action.followUp')}
                </button>
                {onOpenManuals && status !== 'check_failed' ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => onOpenManuals(manualTopic(activeResult))}
                  >
                    <BookOpen size={16} aria-hidden />
                    {t('nav.manuals')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
        <TicketDraftCard draft={status === 'check_failed' ? null : draft} onConfirmed={(id) => setTicketId(id)} />
        {ticketId ? (
          <p className="ticket-draft__ok">
            {t('ticket.confirmedId')}: {ticketId}
          </p>
        ) : null}
        {loading ? (
          <p className="chat-processing" role="status">
            <Loader2 size={16} className="spin-slow" aria-hidden />
            {t('chat.processing')}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="panel__error chat-error" role="alert">
          <span>{error}</span>
          <div className="chat-error__actions">
            {!conversationId ? (
              <button type="button" className="btn btn--secondary" onClick={() => setConversationRetry((n) => n + 1)}>
                <RotateCcw size={15} aria-hidden />
                {t('history.retry')}
              </button>
            ) : null}
            {retryText ? (
              <button type="button" className="btn btn--secondary" onClick={() => void send(retryText)}>
                <RotateCcw size={15} aria-hidden />
                {t('chat.retrySend')}
              </button>
            ) : null}
            <button
              type="button"
              className="icon-btn"
              aria-label={t('common.close')}
              onClick={() => {
                setError(null)
                setRetryText(null)
              }}
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
      {sourceError ? (
        <p className="panel__error" role="alert">
          {sourceError}
        </p>
      ) : null}

      <form
        className="chat-compose"
        onSubmit={(event) => {
          event.preventDefault()
          void send(input)
        }}
      >
        <div className="chat-compose__bar">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('chat.placeholder')}
            rows={2}
            disabled={!conversationId}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (!loading && input.trim()) void send(input)
              }
            }}
          />
          <VoiceCapture key={contextKey} disabled={loading || !conversationId} onText={onVoiceText} compact />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading || !conversationId || !input.trim()}
          >
            {loading ? <Loader2 size={16} className="spin-slow" aria-hidden /> : <Send size={16} aria-hidden />}
            {t('chat.send')}
          </button>
        </div>
      </form>

      <SourceDrawer hit={evidenceHit} onClose={() => setEvidenceHit(null)} />
    </section>
  )
}
