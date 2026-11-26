import { useState } from 'react'
import { confirmTicketDraft, type DraftPayload } from '../api/chat'
import { useI18n } from '../i18n/I18nContext'
import { resolveErrorMessage } from '../lib/i18nError'

interface TicketDraftCardProps {
  draft: DraftPayload | null
  onConfirmed: (ticketId: string) => void
}

export function TicketDraftCard({ draft, onConfirmed }: TicketDraftCardProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  if (!draft?.draft_id || !draft.confirm_nonce) {
    return null
  }

  const payload = draft.payload

  const onConfirm = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await confirmTicketDraft(draft.draft_id, draft.confirm_nonce)
      setStatus(result.status)
      if (result.status === 'created' && result.ticket_id) {
        onConfirmed(result.ticket_id)
      } else if (result.message) {
        setError(result.message)
      }
    } catch (err: unknown) {
      setError(resolveErrorMessage(t, err, 'error.confirm'))
    } finally {
      setLoading(false)
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
                {payload.references.map((ref) => (
                  <li key={`${ref.manual}-${ref.pdf_page}`}>
                    {ref.manual}, {t('ticket.pdfPage')} {ref.pdf_page}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      ) : null}

      {error ? <p className="panel__error">{error}</p> : null}
      {status === 'created' ? <p className="ticket-draft__ok">{t('ticket.draft.created')}</p> : null}

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={loading || status === 'created'}
        onClick={() => void onConfirm()}
      >
        {loading ? t('ticket.draft.sending') : t('ticket.confirmBtn')}
      </button>
    </section>
  )
}