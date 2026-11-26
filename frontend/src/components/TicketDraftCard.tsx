import { useState } from 'react'
import { confirmTicketDraft, type DraftPayload } from '../api/chat'

interface TicketDraftCardProps {
  draft: DraftPayload | null
  onConfirmed: (ticketId: string) => void
}

export function TicketDraftCard({ draft, onConfirmed }: TicketDraftCardProps) {
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
      setError(err instanceof Error ? err.message : 'Ошибка подтверждения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="ticket-draft panel" aria-labelledby="ticket-draft-title">
      <h2 id="ticket-draft-title" className="panel__title">
        Черновик заявки ТОиР
      </h2>
      <p className="panel__subtitle">Отправка возможна только после вашего подтверждения.</p>

      {payload ? (
        <dl className="ticket-draft__grid">
          <div>
            <dt>Диагноз (гипотеза)</dt>
            <dd>{payload.conclusion}</dd>
          </div>
          <div>
            <dt>Приоритет</dt>
            <dd>{payload.urgency}</dd>
          </div>
          <div>
            <dt>Код отклонения</dt>
            <dd>{payload.anomaly_type ?? '—'}</dd>
          </div>
          <div>
            <dt>Работы</dt>
            <dd>
              <ul>
                {payload.operations.map((op) => (
                  <li key={op}>{op}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt>Источники</dt>
            <dd>
              <ul>
                {payload.references.map((ref) => (
                  <li key={`${ref.manual}-${ref.pdf_page}`}>
                    {ref.manual}, PDF стр. {ref.pdf_page}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      ) : null}

      {error ? <p className="panel__error">{error}</p> : null}
      {status === 'created' ? <p className="ticket-draft__ok">Заявка создана в Mock ТОиР.</p> : null}

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={loading || status === 'created'}
        onClick={() => void onConfirm()}
      >
        {loading ? 'Отправка…' : 'Подтвердить и отправить заявку'}
      </button>
    </section>
  )
}