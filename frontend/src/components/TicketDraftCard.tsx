import { useRef, useState } from 'react'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { confirmTicketDraft, type DraftPayload } from '../api/chat'
import type { ManualSearchHit } from '../api/manuals'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { resolveErrorMessage } from '../lib/i18nError'
import { docIdFromManualTitle } from '../lib/manuals'
import { SourceDrawer } from './SourceDrawer'

interface TicketDraftCardProps {
  draft: DraftPayload | null
  onConfirmed: (ticketId: string) => void
  onReplace?: () => void
}

export function TicketDraftCard({ draft, onConfirmed, onReplace }: TicketDraftCardProps) {
  if (!draft?.draft_id || !draft.confirm_nonce) return null
  return <TicketDraftBody key={draft.draft_id} draft={draft} onConfirmed={onConfirmed} onReplace={onReplace} />
}

function TicketDraftBody({
  draft,
  onConfirmed,
  onReplace,
}: {
  draft: DraftPayload
  onConfirmed: (ticketId: string) => void
  onReplace?: () => void
}) {
  const { locale, t } = useI18n()
  const confirming = useRef(false)
  const [phase, setPhase] = useState<'idle' | 'sending' | 'created' | 'duplicate' | 'unknown' | 'blocked' | 'stale'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [source, setSource] = useState<ManualSearchHit | null>(null)

  const payload = draft.payload
  const locked = phase === 'sending' || phase === 'created' || phase === 'duplicate' || phase === 'unknown' || phase === 'blocked' || phase === 'stale'

  const urgencyLabel = (urgency: string | undefined): string => {
    if (urgency === 'low' || urgency === 'medium' || urgency === 'high') {
      return t(`ticket.urgency.${urgency}` as TranslationKey)
    }
    return urgency ?? '—'
  }

  const onConfirm = async () => {
    if (confirming.current || locked || !acknowledged || !draft.confirm_nonce) return
    confirming.current = true
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
        setError(t('ticket.status.duplicate'))
        return
      }
      if (result.status === 'unknown') {
        setPhase('unknown')
        setError(t('ticket.status.unknown'))
        return
      }
      if (result.status === 'refused' || result.status === 'stale') {
        setPhase(result.status === 'stale' ? 'stale' : 'blocked')
        setError(t('ticket.confirmBlocked'))
        return
      }
      setPhase('idle')
      setError(locale === 'ru' ? result.message || t('error.confirm') : t('error.confirm'))
    } catch (err: unknown) {
      setPhase('idle')
      setError(resolveErrorMessage(t, err, 'error.confirm'))
    } finally {
      confirming.current = false
    }
  }

  return (
    <>
      <section className="ticket-draft panel" aria-labelledby="ticket-draft-title">
      <div className="ticket-draft__head">
        <span className="ticket-draft__icon" aria-hidden>
          <ShieldCheck size={20} />
        </span>
        <div>
          <h2 id="ticket-draft-title" className="panel__title">
            {t('ticket.confirmTitle')}
          </h2>
          <p className="panel__subtitle">{t('ticket.draft.subtitle')}</p>
        </div>
      </div>

      {payload ? (
        <dl className="ticket-draft__grid">
          {payload.vehicle_id || payload.session_id ? (
            <div>
              <dt>{t('diag.vehicle')}</dt>
              <dd>
                {payload.vehicle_id ?? '—'} · {payload.session_id ?? '—'}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{t('ticket.draft.diagnosis')}</dt>
            <dd>{payload.conclusion}</dd>
          </div>
          <div>
            <dt>{t('ticket.draft.priority')}</dt>
            <dd>{urgencyLabel(payload.urgency)}</dd>
          </div>
          <div>
            <dt>{t('ticket.draft.code')}</dt>
            <dd>{payload.anomaly_type ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('ticket.draft.operations')}</dt>
            <dd>
              <ul>
                {(payload.operations ?? []).map((operation) => (
                  <li key={operation}>{operation}</li>
                ))}
              </ul>
            </dd>
          </div>
          {!!payload.spare_parts?.length && (
            <div>
              <dt>{t('tickets.spareParts')}</dt>
              <dd><ul>{payload.spare_parts.map((part) => <li key={part}>{part}</li>)}</ul></dd>
            </div>
          )}
          <div>
            <dt>{t('ticket.draft.sources')}</dt>
            <dd>
              <ul>
                {(payload.references ?? []).map((reference, index) => {
                  const docId = docIdFromManualTitle(reference.manual ?? '')
                  const page = reference.pdf_page ?? 1
                  return (
                    <li key={`${reference.manual}-${page}-${index}`}>
                      {docId ? (
                        <button
                          type="button"
                          className="chat-source-link"
                          onClick={() =>
                            setSource({
                              evidence_id: `${docId}:${page}`,
                              doc_id: docId,
                              manual_title: reference.manual ?? '',
                              pdf_page: page,
                              quote: '',
                              score: 0,
                              extraction: 'text',
                            })
                          }
                        >
                          {reference.manual}, {t('ticket.pdfPage')} {page}
                        </button>
                      ) : (
                        <span>
                          {reference.manual}, {t('ticket.pdfPage')} {page}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </dd>
          </div>
        </dl>
      ) : null}

      {error ? <p className="panel__error" role="alert">{error}</p> : null}
      {phase === 'stale' && onReplace && (
        <button type="button" className="btn btn--secondary" onClick={onReplace}>{t('chat.suggest3')}</button>
      )}
      {phase === 'created' ? (
        <p className="ticket-draft__ok">
          <CheckCircle2 size={16} aria-hidden />
          {t('ticket.draft.created')}
        </p>
      ) : null}
      {ticketId && phase !== 'created' ? (
        <p className="ticket-draft__ok">
          {t('ticket.confirmedId')}: {ticketId}
        </p>
      ) : null}

      <label className={locked ? 'ticket-ack ticket-ack--locked' : 'ticket-ack'}>
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={locked}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>{t('ticket.ack')}</span>
      </label>

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={locked || !acknowledged}
        onClick={() => void onConfirm()}
      >
        {phase === 'sending' ? t('ticket.draft.sending') : t('ticket.confirmBtn')}
      </button>
      </section>
      <SourceDrawer hit={source} onClose={() => setSource(null)} />
    </>
  )
}
