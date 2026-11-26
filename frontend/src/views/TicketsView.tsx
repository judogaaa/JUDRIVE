import { useEffect, useState } from 'react'
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
          {tickets.length === 0 ? (
            <p className="panel__subtitle">{t('tickets.empty')}</p>
          ) : (
            <div className="ticket-journal">
              {tickets.map((row) => (
                <article key={row.local_id} className="ticket-row">
                  <div className="ticket-row__head">
                    <span className="ticket-row__id">{row.ticket_id ?? '—'}</span>
                    <span className="ticket-row__meta">{formatSessionDateTime(locale, row.created_at)}</span>
                  </div>
                  <p className="ticket-row__meta">
                    {row.vehicle_id} · {row.session_id} · {row.submit_status}
                  </p>
                  {parseConclusion(row.payload_snapshot) ? (
                    <p>{parseConclusion(row.payload_snapshot)}</p>
                  ) : null}
                  {row.error_detail ? <p className="panel__error">{row.error_detail}</p> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  )
}