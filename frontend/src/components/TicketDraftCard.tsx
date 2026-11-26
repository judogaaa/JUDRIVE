import { useState } from 'react'
import { confirmTicketDraft, type DraftPayload, type SourceHit } from '../api/chat'
import { useI18n } from '../i18n/I18nContext'
import { resolveErrorMessage } from '../lib/i18nError'
import { CopyButton } from './CopyButton'

interface TicketDraftCardProps {
  draft: DraftPayload | null
  onConfirmed: (ticketId: string) => void
  sources?: SourceHit[]
  onOpenSource?: (source: SourceHit) => void
}

export function TicketDraftCard({ draft, onConfirmed, sources, onOpenSource }: TicketDraftCardProps) {
  if (!draft?.draft_id || !draft.confirm_nonce) return null
  return <TicketDraftBody key={draft.draft_id} draft={draft} onConfirmed={onConfirmed} sources={sources} onOpenSource={onOpenSource} />
}

function TicketDraftBody({
  draft,
  onConfirmed,
  sources,
  onOpenSource,
}: {
  draft: DraftPayload
  onConfirmed: (ticketId: string) => void
  sources?: SourceHit[]
  onOpenSource?: (source: SourceHit) => void
}) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<'idle' | 'sending' | 'created' | 'duplicate' | 'unknown'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [ticketId, setTicketId] = useState<string | null>(null)

  const payload = draft.payload
  const locked = phase === 'sending' || phase === 'created' || phase === 'duplicate' || phase === 'unknown'

  const onConfirm = async () => {
    if (locked || !draft.confirm_nonce) return
    setPhase('sending')
    setError(null)
    try {
      const result = await confirmTicketDraft(draft.draft_id, draft.confirm_nonce)
      if (result.status === 'created' && result.ticket_id) {
        setPhase('created')
        setTicketId(result.ticket_id)
        onConfirmed(result.ticket_id)
        return
      }
      if (result.status === 'duplicate') {
        setPhase('duplicate')
        if (result.ticket_id) {
          setTicketId(result.ticket_id)
          onConfirmed(result.ticket_id)
        }
        setError(result.message || t('ticket.status.duplicate'))
        return
      }
      if (result.status === 'unknown') {
        setPhase('unknown')
        setError(result.message || t('ticket.status.unknown'))
        return
      }
      setPhase('idle')
      setError(result.message || t('error.confirm'))
    } catch (err: unknown) {
      setPhase('idle')
      setError(resolveErrorMessage(t, err, 'error.confirm'))
    }
  }

  return (
    <section className="ticket-draft panel" aria-labelledby="ticket-draft-title">
      <h2 id="ticket-draft-title" className="panel__title">
        {t('ticket.confirmTitle')}
      </h2>
      <p className="panel__subtitle">{t('ticket.draft.subtitle')}</p>

      {payload ? (
        <dl className="ticket-draft__grid">
          <div>
            <dt>{t('ticket.draft.diagnosis')}</dt>
            <dd>{payload.conclusion}</dd>
          </div>
          <div>
            <dt>{t('ticket.draft.priority')}</dt>
            <dd>{payload.urgency}</dd>
          </div>
          <div>
            <dt>{t('ticket.draft.code')}</dt>
            <dd>{payload.anomaly_type ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('ticket.draft.operations')}</dt>
            <dd>
              <ul>
                {payload.operations.map((op) => (
                  <li key={op}>{op}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt>{t('ticket.draft.sources')}</dt>
            <dd>
              <ul>
                {payload.references.map((ref) => {
                  const source = sources?.find((hit) => hit.manual_title === ref.manual && hit.pdf_page === ref.pdf_page)
                  const label = `${ref.manual}, ${t('ticket.pdfPage')} ${ref.pdf_page}`
                  return <li key={`${ref.manual}-${ref.pdf_page}`}>{source && onOpenSource ? <button type="button" className="chat-source-link" onClick={() => onOpenSource(source)}>{label}</button> : label}</li>
                })}
              </ul>
            </dd>
          </div>
        </dl>
      ) : null}

      {payload ? <CopyButton key={draft.draft_id} text={[`${payload.vehicle_id ?? ''} · ${payload.session_id ?? ''}`, payload.conclusion, ...payload.operations, ...payload.references.map((ref) => `${ref.manual}, PDF ${ref.pdf_page}`)].join('\n')} /> : null}
      {error ? <p className="panel__error">{error}</p> : null}
      {phase === 'created' ? <p className="ticket-draft__ok">{t('ticket.draft.created')}</p> : null}
      {ticketId && phase !== 'created' ? (
        <p className="ticket-draft__ok">
          {t('ticket.confirmedId')}: {ticketId}
        </p>
      ) : null}

      <button type="button" className="btn btn--primary btn--block" disabled={locked} onClick={() => void onConfirm()}>
        {phase === 'sending' ? t('ticket.draft.sending') : t('ticket.confirmBtn')}
      </button>
    </section>
  )
}
