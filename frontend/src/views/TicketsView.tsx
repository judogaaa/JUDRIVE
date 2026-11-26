import { useMemo, useState, useEffect } from 'react'
import { createConversation, sendChatMessage } from '../api/chat'
import { fetchTickets, type TicketSubmission } from '../api/tickets'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'

interface TicketsViewProps {
  filterVehicleId?: string
}

function parseConclusion(snapshot: string | null): string | null {
  if (!snapshot) return null
  try {
    const data = JSON.parse(snapshot) as { conclusion?: string }
    return typeof data.conclusion === 'string' ? data.conclusion : null
  } catch {
    return null
  }
}

export function TicketsView({ filterVehicleId }: TicketsViewProps) {
  const { t, locale } = useI18n()
  const [tickets, setTickets] = useState<TicketSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [review, setReview] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTickets(filterVehicleId)
      .then((rows) => {
        if (!cancelled) setTickets(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('error.tickets'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filterVehicleId])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tickets
    return tickets.filter((row) =>
      [row.ticket_id, row.vehicle_id, row.session_id, row.submit_status, parseConclusion(row.payload_snapshot)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [query, tickets])

  const explain = async (row: TicketSubmission) => {
    setReviewing(true)
    setReview(null)
    try {
      const conv = await createConversation(row.vehicle_id, row.session_id)
      const reply = await sendChatMessage(
        conv.conversation_id,
        'Разбери эту заявку: какие работы и в каком порядке проверить по руководству этого двигателя. Не придумывай статус ремонта.',
        locale,
      )
      setReview(reply.reply)
    } catch (err: unknown) {
      setReview(err instanceof Error ? err.message : t('error.agent'))
    } finally {
      setReviewing(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>{t('tickets.title')}</h1>
        <p>{t('tickets.subtitle')}</p>
      </header>

      {loading ? <p className="panel__subtitle">{t('tickets.loading')}</p> : null}
      {error ? (
        <p className="panel__error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <section className="panel">
          <div className="ticket-toolbar">
            <label className="field">
              <span>{t('fleet.searchLabel')}</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('fleet.searchPlaceholder')} />
            </label>
          </div>
          <p className="toolbar-meta">{t('fleet.count', { shown: visible.length, total: tickets.length })}</p>
          {visible.length === 0 ? (
            <p className="panel__subtitle">{t('tickets.empty')}</p>
          ) : (
            <div className="ticket-journal">
              {visible.map((row) => (
                <article key={row.local_id} className="ticket-row">
                  <button type="button" className="ticket-row__head" onClick={() => setOpenId(row.local_id)}>
                    <span className="ticket-row__id">{row.ticket_id ?? '—'}</span>
                    <span className="ticket-row__meta">{formatSessionDateTime(locale, row.created_at)}</span>
                  </button>
                  <p className="ticket-row__meta">
                    {row.vehicle_id} · {row.session_id}{' '}
                    <span className={`badge badge--${row.submit_status === 'created' ? 'normal' : 'attention'}`}>
                      {row.submit_status}
                    </span>
                  </p>
                  {parseConclusion(row.payload_snapshot) ? (
                    <p>{parseConclusion(row.payload_snapshot)}</p>
                  ) : null}
                  {row.error_detail ? <p className="panel__error">{row.error_detail}</p> : null}
                  {openId === row.local_id ? (
                    <div className="ticket-detail">
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => void navigator.clipboard.writeText(row.ticket_id ?? row.local_id)}
                      >
                        {row.ticket_id ?? row.local_id}
                      </button>
                      <button type="button" className="btn btn--secondary" disabled={reviewing} onClick={() => void explain(row)}>
                        {reviewing ? t('chat.processing') : t('tickets.review')}
                      </button>
                      {review ? <div className="ticket-review">{review}</div> : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  )
}