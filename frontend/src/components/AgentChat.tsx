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
import { manualTopic, usableStatus, type DiagnosisAction, type ChatIntent } from '../lib/workflow'

interface AgentChatProps {
  vehicleId: string
  sessionId: string
  diagnoseResult?: DiagnoseResponse | null
  onDiagnoseCommand?: () => void
  chatIntent?: ChatIntent | null
  onChatIntentConsumed?: () => void
  onOpenTicket?: (ticketId: string) => void
  onOpenHistory?: () => void
  onChooseSession?: () => void
  onOpenManuals?: (query: string) => void
}

const SUGGESTIONS: { label: TranslationKey; action: DiagnosisAction }[] = [
  { label: 'chat.suggest1', action: 'explain' },
  { label: 'chat.suggest2', action: 'next_checks' },
  { label: 'chat.suggest3', action: 'prepare_ticket' },
]

function isDiagnoseVoiceCommand(text: string, localizedPhrase: string, localizedButton: string): boolean {
  const normalize = (value: string) => value.normalize('NFC').trim().toLowerCase().replace(/[.!?।！？]+$/, '').trim().replace(/\s+/g, ' ')
  const command = normalize(text)
  return [localizedPhrase, localizedButton, 'запусти диагностику', 'получить результат диагностики', 'run diagnosis']
    .some((phrase) => normalize(phrase) === command)
}

export function AgentChat({
  vehicleId,
  sessionId,
  diagnoseResult,
  onDiagnoseCommand,
  chatIntent,
  onChatIntentConsumed,
  onOpenManuals,
  onOpenHistory,
  onOpenTicket,
  onChooseSession,
}: AgentChatProps) {
  const { locale, t } = useI18n()
  const contextKey = `${vehicleId}:${sessionId}`
  const contextRef = useRef(contextKey)
  const logRef = useRef<HTMLDivElement | null>(null)
  const sendGen = useRef(0)
  const sendingRef = useRef(false)
  const sendAbortRef = useRef<AbortController | null>(null)
  const pendingIntent = useRef<{ text: string; action?: DiagnosisAction } | null>(null)
  const sourceRequest = useRef(0)
  const composerEvidence = useRef<string | undefined>(undefined)
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
  const [retryMessage, setRetryMessage] = useState<{ text: string; action?: DiagnosisAction; evidenceId?: string } | null>(null)
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
    contextRef.current = contextKey
    const epoch = ++sendGen.current
    sendAbortRef.current?.abort()
    sendAbortRef.current = null
    sendingRef.current = false
    setConversationId(null)
    setMessages([])
    setLoading(false)
    setError(null)
    setRetryMessage(null)
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
    return () => {
      controller.abort()
      sendAbortRef.current?.abort()
      sendGen.current += 1
      sourceRequest.current += 1
    }
  }, [contextKey, vehicleId, sessionId, conversationRetry])

  const send = useCallback(
    async (text: string, action?: DiagnosisAction, evidenceId?: string) => {
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
      setRetryMessage(null)
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
      setMessages((prev) => [...prev, userMsg])
      setInput((current) => current.trim() === trimmed ? '' : current)

      try {
        const reply = await sendChatMessage(convId, trimmed, locale, false, controller.signal, action, evidenceId)
        if (epoch !== sendGen.current || contextRef.current !== key) return
        if (composerEvidence.current === evidenceId) composerEvidence.current = undefined
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
        setRetryMessage({ text: trimmed, action, evidenceId })
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
    if (chatIntentRef.current === chatIntent.id) return
    chatIntentRef.current = chatIntent.id
    if (chatIntent.autoSend) {
      pendingIntent.current = { text: chatIntent.message, action: chatIntent.action }
    } else {
      composerEvidence.current = chatIntent.evidenceId
      prefill(chatIntent.message)
    }
    onChatIntentConsumed?.()
  }, [chatIntent, onChatIntentConsumed, sessionId, vehicleId])

  useEffect(() => {
    if (!conversationId || loading || !pendingIntent.current || sendingRef.current) return
    const { text, action } = pendingIntent.current
    pendingIntent.current = null
    void send(text, action)
  }, [chatIntent, conversationId, loading, send])

  const openEvidence = async (hit: SourceHit) => {
    const request = ++sourceRequest.current
    setSourceError(null)
    setSourceLoadingId(null)
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
      if (request !== sourceRequest.current) return
      setEvidenceHit({ ...row, score: 'score' in row ? Number(row.score) || 0 : 0 })
    } catch {
      if (request !== sourceRequest.current) return
      setSourceError(tRef.current('error.source'))
    } finally {
      if (request === sourceRequest.current) setSourceLoadingId(null)
    }
  }

  const onVoiceText = (text: string) => {
    if (onDiagnoseCommand && isDiagnoseVoiceCommand(text, t('voice.diagnosePhrase'), t('diag.run'))) {
      onDiagnoseCommand()
      return
    }
    setInput((prev) => (prev.trim() ? `${prev}\n${text}` : text))
  }

  const lastAssistantId = messages.filter((message) => message.role === 'assistant').at(-1)?.id

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
        {SUGGESTIONS.filter(({ action }) => action !== 'prepare_ticket' || status === 'anomaly').map(({ label, action }) => (
          <button
            key={action}
            type="button"
            className="chip-button"
            disabled={loading || !conversationId}
            onClick={() => void send(t(label), action)}
          >
            {t(label)}
          </button>
        ))}
      </div>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {activeResult && status ? (
          <article className="chat-bubble chat-bubble--assistant chat-diagnosis-result">
            <p className="chat-bubble__role">{t('diag.title')} · {activeResult.session_id}</p>
            <p className="chat-bubble__text">
              <strong>{t(status === 'normal' ? 'verdict.normal.title' : status === 'anomaly' ? 'verdict.anomaly.title' : 'verdict.failed.title')}</strong>
            </p>
            {status === 'anomaly' && activeResult.anomaly_type ? (
              <p className="chat-bubble__text">{t('verdict.type')}: {activeResult.anomaly_type}{activeResult.anomaly_title ? ` — ${activeResult.anomaly_title}` : ''}</p>
            ) : null}
            <p className="chat-bubble__text">
              {t(status === 'normal' ? 'verdict.normal.footnote' : status === 'anomaly' ? 'verdict.anomaly.lead' : 'verdict.failed.lead')}
            </p>
          </article>
        ) : null}
        {messages.length === 0 && !activeResult ? <p className="panel__subtitle chat-empty">{t('chat.empty')}</p> : null}
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
            {message.role === 'assistant' && message.id === lastAssistantId ? (
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
                {onOpenHistory && status !== 'check_failed' && (
                  <button type="button" className="btn btn--secondary" onClick={onOpenHistory}>
                    {t('history.title')}
                  </button>
                )}
                {onChooseSession && status === 'check_failed' && (
                  <button type="button" className="btn btn--secondary" onClick={onChooseSession}>
                    {t('verdict.action.chooseOther')}
                  </button>
                )}
                {status === 'anomaly' && !draft && !ticketId && (
                  <button type="button" className="btn btn--secondary" disabled={loading || !conversationId}
                    onClick={() => void send(t('chat.suggest3'), 'prepare_ticket')}>
                    {t('chat.suggest3')}
                  </button>
                )}
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
        <TicketDraftCard
          onReplace={status === 'anomaly' && !loading && conversationId
            ? () => void send(t('chat.suggest3'), 'prepare_ticket') : undefined}
          draft={status === 'check_failed' ? null : draft} onConfirmed={(id) => setTicketId(id)} />
        {ticketId ? (
          <p className="ticket-draft__ok">
            {t('ticket.confirmedId')}: {ticketId}
            {onOpenTicket && (
              <button type="button" className="chat-source-link" onClick={() => onOpenTicket(ticketId)}>
                {t('nav.tickets')}
              </button>
            )}
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
            {retryMessage ? (
              <button type="button" className="btn btn--secondary" onClick={() => void send(retryMessage.text, retryMessage.action, retryMessage.evidenceId)}>
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
                setRetryMessage(null)
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
          void send(input, undefined, composerEvidence.current)
        }}
      >
        <div className="chat-compose__bar">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-label={t('chat.placeholder')}
            placeholder={t('chat.placeholder')}
            rows={2}
            disabled={!conversationId}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                if (!loading && input.trim()) void send(input, undefined, composerEvidence.current)
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
