import { useMemo, useState, useEffect } from 'react'
import { ChevronRight, Copy, X } from 'lucide-react'
import { createConversation, sendChatMessage } from '../api/chat'
import type { ManualSearchHit } from '../api/manuals'
import { SourceDrawer } from '../components/SourceDrawer'
import { fetchTickets, type TicketSubmission } from '../api/tickets'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'

interface TicketsViewProps {
  filterVehicleId?: string
}

function docIdFromTitle(title: string): string {
  const map: [string, string][] = [
    ['236-3902150', 'y236-re'],
    ['236.01.01', 'y236-rk'],
    ['536.3902150', 'y536-re'],
    ['536.01.02', 'y536-rk'],
    ['5234', 'z5234-rk'],
    ['409', 'z409-rk'],
  ]
  return map.find(([needle]) => title.includes(needle))?.[1] ?? ''
}

function parsePayload(snapshot: string | null): {
  conclusion?: string
  urgency?: string
  operations?: string[]
  spare_parts?: string[]
  references?: { manual?: string; pdf_page?: number }[]
} | null {
  if (!snapshot) return null
  try {
    return JSON.parse(snapshot) as ReturnType<typeof parsePayload>
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
  const [source, setSource] = useState<ManualSearchHit | null>(null)

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
      [row.ticket_id, row.vehicle_id, row.session_id, row.submit_status, parsePayload(row.payload_snapshot)?.conclusion]
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

  const open = tickets.find((row) => row.local_id === openId) ?? null
  const payload = parsePayload(open?.payload_snapshot ?? null)

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
            <span>{t('tickets.find')}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('tickets.find')} />
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
                      {row.submit_status === 'created' ? t('tickets.statusCreated') : row.submit_status}
                    </span>
                    <ChevronRight size={18} aria-hidden />
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
      {open ? (
        <div className="drawer-scrim" role="presentation" onClick={() => setOpenId(null)}>
          <aside className="history-drawer" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="history-drawer__head">
              <h2>{open.ticket_id ?? '—'}</h2>
              <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={() => setOpenId(null)}><X size={18} /></button>
            </div>
            <p>{open.vehicle_id} · {open.session_id} · {open.submit_status === 'created' ? t('tickets.statusCreated') : open.submit_status}</p>
            {payload?.urgency ? <p>{payload.urgency}</p> : null}
            {payload?.conclusion ? <p>{payload.conclusion}</p> : null}
            {payload?.operations?.length ? <ul>{payload.operations.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            {payload?.spare_parts?.length ? <p>{payload.spare_parts.join(', ')}</p> : null}
            {payload?.references?.map((ref) => (
              <button
                key={`${ref.manual}-${ref.pdf_page}`}
                type="button"
                className="chat-source-link"
                onClick={() => {
                  setSource({
                    evidence_id: `${ref.manual}-${ref.pdf_page}`,
                    doc_id: docIdFromTitle(ref.manual ?? ''),
                    manual_title: ref.manual ?? '',
                    pdf_page: ref.pdf_page ?? 1,
                    quote: '',
                    score: 0,
                    extraction: 'text',
                  })
                }}
              >
                {ref.manual}, {t('ticket.pdfPage')} {ref.pdf_page}
              </button>
            ))}
            <button type="button" className="btn btn--secondary" onClick={() => void navigator.clipboard.writeText(open.ticket_id ?? open.local_id)}>
              <Copy size={18} aria-hidden /> {open.ticket_id ?? open.local_id}
            </button>
            <button type="button" className="btn btn--secondary" disabled={reviewing} onClick={() => void explain(open)}>
              {reviewing ? t('chat.processing') : t('tickets.review')}
            </button>
            {review ? <div className="ticket-review">{review}</div> : null}
          </aside>
        </div>
      ) : null}
      <SourceDrawer hit={source} onClose={() => setSource(null)} />
    </>
  )
}