import { useEffect, useState } from 'react'
import { fetchTickets, type TicketSubmission } from '../api/tickets'

interface TicketsViewProps {
  filterVehicleId?: string
}

function formatWhen(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки')
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
        <h1>Журнал заявок</h1>
        <p>
          Отправленные заявки после подтверждения механиком
          {filterVehicleId ? ` по ${filterVehicleId}` : ''}. Дубликаты по паре ТС/сессия блокируются backend.
        </p>
      </header>

      {loading ? <p className="panel__subtitle">Загрузка…</p> : null}
      {error ? (
        <p className="panel__error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <section className="panel">
          {tickets.length === 0 ? (
            <p className="panel__subtitle">Пока нет подтверждённых заявок. Подготовьте черновик в чате на вкладке «Диагностика».</p>
          ) : (
            <div className="ticket-journal">
              {tickets.map((row) => (
                <article key={row.local_id} className="ticket-row">
                  <div className="ticket-row__head">
                    <span className="ticket-row__id">{row.ticket_id ?? '—'}</span>
                    <span className="ticket-row__meta">{formatWhen(row.created_at)}</span>
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