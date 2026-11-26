import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Filter, X } from 'lucide-react'
import { createConversation, sendChatMessage, type SourceHit } from '../api/chat'
import { fetchEvidence, type ManualSearchHit } from '../api/manuals'
import { fetchTickets, type TicketSubmission } from '../api/tickets'
import { MessageText, readableAnswer } from '../components/MessageText'
import { CopyButton } from '../components/CopyButton'
import { SourceDrawer } from '../components/SourceDrawer'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { formatSessionDateTime } from '../lib/formatLocale'
import { resolveErrorMessage } from '../lib/i18nError'
import { docIdFromManualTitle } from '../lib/manuals'

interface TicketsViewProps {
  isVisible: boolean
  linkedTicketId?: string
  onLinkedTicketConsumed?: () => void
  filterVehicleId?: string
  onFilterConsumed?: () => void
  onOpenDiagnosis?: (vehicleId: string, sessionId?: string) => void
}

type TicketPayload = {
  conclusion?: string
  urgency?: string
  operations?: string[]
  spare_parts?: string[]
  references?: { manual?: string; pdf_page?: number }[]
  vehicle_id?: string
  session_id?: string
  anomaly_type?: string
}

function parsePayload(snapshot: string | null): TicketPayload | null {
  if (!snapshot) return null
  try {
    return JSON.parse(snapshot) as TicketPayload
  } catch {
    return null
  }
}

export function TicketsView({ isVisible, filterVehicleId, linkedTicketId, onLinkedTicketConsumed, onFilterConsumed, onOpenDiagnosis }: TicketsViewProps) {
  const { t, locale } = useI18n()
  const [tickets, setTickets] = useState<TicketSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState(filterVehicleId ?? '')
  const [openId, setOpenId] = useState<string | null>(null)
  const [review, setReview] = useState<string | null>(null)
  const [reviewSources, setReviewSources] = useState<SourceHit[]>([])
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [source, setSource] = useState<ManualSearchHit | null>(null)
  const reviewGen = useRef(0)
  const sourceGen = useRef(0)
  const reviewRequest = useRef<AbortController | null>(null)

  useEffect(() => () => {
    reviewRequest.current?.abort()
    reviewGen.current += 1
    sourceGen.current += 1
  }, [])

  const statusLabel = (status: string) => {
    if (status === 'created') return t('tickets.statusCreated')
    if (status === 'sending') return t('tickets.statusSending')
    if (status === 'unknown') return t('tickets.statusUnknown')
    if (status === 'refused') return t('tickets.statusRefused')
    return t('tickets.statusFailed')
  }
  const statusTone = (status: string) => {
    if (status === 'created') return 'normal'
    if (status === 'refused' || status === 'failed') return 'quarantine'
    return 'attention'
  }
  const urgencyLabel = (urgency: string | undefined): string => {
    if (urgency === 'low' || urgency === 'medium' || urgency === 'high') {
      return t(`ticket.urgency.${urgency}` as TranslationKey)
    }
    return urgency ?? '—'
  }

  useEffect(() => {
    if (!filterVehicleId) return
    if (filterVehicleId !== vehicleFilter) selectTicket(null)
    setVehicleFilter(filterVehicleId)
    setQuery('')
    onFilterConsumed?.()
  }, [filterVehicleId, onFilterConsumed])

  useEffect(() => {
    if (!isVisible) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTickets(vehicleFilter || undefined)
      .then((rows) => {
        if (!cancelled) setTickets(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(resolveErrorMessage(t, err, 'error.tickets'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [retry, t, vehicleFilter, isVisible])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tickets
    return tickets.filter((row) => {
      const payload = parsePayload(row.payload_snapshot)
      return [row.ticket_id, row.vehicle_id, row.session_id, row.submit_status, payload?.conclusion, payload?.anomaly_type]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [query, tickets])

  const buildTicketReviewMessage = (row: TicketSubmission): string => {
    const snapshot = row.payload_snapshot?.trim() || '{}'
    const parsed = parsePayload(row.payload_snapshot)
    const refs = parsed?.references ?? []
    const sourcesBlock =
      refs.length > 0
        ? `Источники заявки (references из snapshot):\n${JSON.stringify(refs, null, 2)}`
        : 'Источники в snapshot не указаны — при необходимости используй search_manuals.'
    return [
      'Разбор уже отправленной заявки (только анализ, без нового черновика).',
      `ticket_id: ${row.ticket_id ?? '—'}`,
      `local_id: ${row.local_id}`,
      `vehicle_id: ${row.vehicle_id}`,
      `session_id: ${row.session_id}`,
      'payload_snapshot (фактические данные заявки):',
      snapshot,
      sourcesBlock,
      'Задача: разобрать работы и порядок проверок по руководству двигателя этой машины, опираясь на snapshot и references. Не придумывай статус ремонта и факт выполнения работ.',
    ].join('\n')
  }

  const selectTicket = (id: string | null) => {
    reviewRequest.current?.abort()
    reviewRequest.current = null
    reviewGen.current += 1
    sourceGen.current += 1
    setReview(null)
    setReviewSources([])
    setReviewError(null)
    setReviewing(false)
    setSource(null)
    setOpenId(id)
  }

  const openReviewSource = async (hit: SourceHit) => {
    const generation = ++sourceGen.current
    setReviewError(null)
    try {
      const record = await fetchEvidence(hit.evidence_id)
      if (generation === sourceGen.current) setSource(record)
    } catch {
      if (generation === sourceGen.current) setReviewError(t('error.source'))
    }
  }

  const explain = async (row: TicketSubmission) => {
    if (reviewRequest.current) return
    const controller = new AbortController()
    reviewRequest.current = controller
    const generation = ++reviewGen.current
    setReviewing(true)
    setReview(null)
    setReviewSources([])
    setReviewError(null)
    try {
      const conversation = await createConversation(row.vehicle_id, row.session_id, controller.signal)
      const reply = await sendChatMessage(conversation.conversation_id, buildTicketReviewMessage(row), locale, true, controller.signal)
      if (generation === reviewGen.current) { setReview(reply.reply); setReviewSources(reply.sources ?? []) }
    } catch (err: unknown) {
      if (generation === reviewGen.current) setReviewError(resolveErrorMessage(t, err, 'error.agent'))
    } finally {
      if (generation === reviewGen.current) {
        reviewRequest.current = null
        setReviewing(false)
      }
    }
  }

  useEffect(() => {
    if (!linkedTicketId || !isVisible || loading || error || filterVehicleId) return
    const linked = tickets.find((row) => row.ticket_id === linkedTicketId)
    if (linked) selectTicket(linked.local_id)
    onLinkedTicketConsumed?.()
  }, [error, filterVehicleId, isVisible, linkedTicketId, loading, onLinkedTicketConsumed, tickets])

  const open = tickets.find((row) => row.local_id === openId) ?? null
  const payload = parsePayload(open?.payload_snapshot ?? null)

  return (
    <>
      <header className="page-header page-header--compact">
        <div>
          <h1>{t('tickets.title')}</h1>
          <p>{t('tickets.subtitle')}</p>
        </div>
      </header>

      {loading ? <p className="panel__subtitle">{t('tickets.loading')}</p> : null}
      {error ? (
        <div className="panel__error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn--secondary" onClick={() => setRetry((value) => value + 1)}>
            {t('history.retry')}
          </button>
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="panel">
          <div className="ticket-toolbar">
            <label className="field ticket-search">
              <span>{t('tickets.find')}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('tickets.find')}
                aria-label={t('tickets.find')}
              />
            </label>
            {vehicleFilter ? (
              <button
                type="button"
                className="filter-chip"
                onClick={() => {
                  setVehicleFilter('')
                  setQuery('')
                }}
                aria-label={t('tickets.clearFilter')}
              >
                <Filter size={15} aria-hidden />
                {t('tickets.filterVehicle', { vehicle: vehicleFilter })}
                <X size={14} aria-hidden />
              </button>
            ) : null}
          </div>
          <p className="toolbar-meta">{t('fleet.count', { shown: visible.length, total: tickets.length })}</p>
          {visible.length === 0 ? (
            <p className="empty-state__text">{t('tickets.empty')}</p>
          ) : (
            <div className="ticket-journal">
              {visible.map((row) => {
                const rowPayload = parsePayload(row.payload_snapshot)
                return (
                  <article key={row.local_id} className="ticket-row">
                    <button type="button" className="ticket-row__head" onClick={() => selectTicket(row.local_id)}>
                      <span className="ticket-row__id">{row.ticket_id ?? row.vehicle_id}</span>
                      <span className="ticket-row__meta">{formatSessionDateTime(locale, row.created_at)}</span>
                      <span className="ticket-row__open">
                        {t('tickets.more')} <ChevronRight size={16} aria-hidden />
                      </span>
                    </button>
                    <div className="ticket-row__summary">
                      <span>{row.vehicle_id}</span>
                      <span>{row.session_id}</span>
                      <span className={`badge badge--${statusTone(row.submit_status)}`}>{statusLabel(row.submit_status)}</span>
                      {rowPayload?.anomaly_type ? <span className="badge">{rowPayload.anomaly_type}</span> : null}
                    </div>
                    {rowPayload?.conclusion ? <p className="ticket-row__conclusion">{rowPayload.conclusion}</p> : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      {open ? (
        <div className="drawer-scrim" role="presentation" onClick={() => selectTicket(null)}>
          <aside
            className="history-drawer ticket-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="history-drawer__head">
              <div>
                <p className="eyebrow">{t('nav.tickets')}</p>
                <h2 id="ticket-detail-title">{open.ticket_id ?? '—'}</h2>
                <p className="ticket-row__meta">{formatSessionDateTime(locale, open.created_at)}</p>
              </div>
              <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={() => selectTicket(null)}>
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="ticket-detail__status">
              <span className={`badge badge--${statusTone(open.submit_status)}`}>{statusLabel(open.submit_status)}</span>
              {onOpenDiagnosis ? (
                <button type="button" className="chat-source-link" onClick={() => onOpenDiagnosis(open.vehicle_id, open.session_id)}>
                  {open.vehicle_id} · {open.session_id}
                </button>
              ) : (
                <span>
                  {open.vehicle_id} · {open.session_id}
                </span>
              )}
            </div>

            {open.error_detail ? (
              <p className="panel__error">
                {t('tickets.errorDetail')}: {open.error_detail}
              </p>
            ) : null}

            {payload ? (
              <dl className="ticket-draft__grid ticket-detail__grid">
                {payload.conclusion ? (
                  <div>
                    <dt>{t('ticket.draft.diagnosis')}</dt>
                    <dd>{payload.conclusion}</dd>
                  </div>
                ) : null}
                {payload.urgency ? (
                  <div>
                    <dt>{t('ticket.draft.priority')}</dt>
                    <dd>{urgencyLabel(payload.urgency)}</dd>
                  </div>
                ) : null}
                {payload.anomaly_type ? (
                  <div>
                    <dt>{t('ticket.draft.code')}</dt>
                    <dd>{payload.anomaly_type}</dd>
                  </div>
                ) : null}
                {payload.operations?.length ? (
                  <div>
                    <dt>{t('ticket.draft.operations')}</dt>
                    <dd>
                      <ul>
                        {payload.operations.map((operation) => (
                          <li key={operation}>{operation}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null}
                {payload.spare_parts?.length ? (
                  <div>
                    <dt>{t('tickets.spareParts')}</dt>
                    <dd>{payload.spare_parts.join(', ')}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t('ticket.draft.sources')}</dt>
                  <dd>
                    {payload.references?.length ? (
                      <ul>
                        {payload.references.map((reference) => {
                          const docId = docIdFromManualTitle(reference.manual ?? '')
                          return (
                            <li key={`${reference.manual}-${reference.pdf_page}`}>
                              {docId ? (
                                <button
                                  type="button"
                                  className="chat-source-link"
                                  onClick={() => {
                                    setSource({
                                      evidence_id: `${reference.manual}-${reference.pdf_page}`,
                                      doc_id: docId,
                                      manual_title: reference.manual ?? '',
                                      pdf_page: reference.pdf_page ?? 1,
                                      quote: '',
                                      score: 0,
                                      extraction: 'text',
                                    })
                                  }}
                                >
                                  {reference.manual}, {t('ticket.pdfPage')} {reference.pdf_page}
                                </button>
                              ) : (
                                <span>
                                  {reference.manual}, {t('ticket.pdfPage')} {reference.pdf_page}
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <span>{t('tickets.noSources')}</span>
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="panel__subtitle">{t('tickets.noPayload')}</p>
            )}

            <div className="workflow-actions">
              {open.ticket_id && <CopyButton text={open.ticket_id} label={t('ticket.confirmedId')} />}
              {payload ? (
                <CopyButton
                  text={[
                    `${t('nav.tickets')}: ${open.ticket_id ?? open.local_id}`,
                    `${open.vehicle_id} · ${open.session_id}`,
                    payload.conclusion ?? '',
                    ...(payload.operations ?? []),
                    ...(payload.references ?? []).map((reference) => `${reference.manual}, PDF ${reference.pdf_page}`),
                  ]
                    .filter(Boolean)
                    .join('\n')}
                />
              ) : <CopyButton text={open.ticket_id ?? open.local_id} />}
              <button type="button" className="btn btn--secondary" disabled={reviewing} onClick={() => void explain(open)}>
                {reviewing ? t('chat.processing') : t('tickets.review')}
              </button>
            </div>
            {reviewError ? <p className="panel__error" role="alert">{reviewError}</p> : null}
            {review ? <div className="ticket-review">
              <MessageText text={review} sources={reviewSources} onOpenSource={(hit) => void openReviewSource(hit)} />
              {reviewSources.length > 0 && <div className="evidence-panel">
                <strong>{t('chat.sourcesTitle')}</strong>
                <ul className="chat-sources">{reviewSources.map((hit) => <li key={hit.evidence_id}>
                  <button type="button" className="chat-source-link" onClick={() => void openReviewSource(hit)}>
                    {hit.manual_title}, {t('ticket.pdfPage')} {hit.pdf_page}
                  </button>
                </li>)}</ul>
              </div>}
              <CopyButton text={readableAnswer(review, reviewSources, t('ticket.pdfPage'))} />
            </div> : null}
          </aside>
        </div>
      ) : null}
      <SourceDrawer hit={source} onClose={() => setSource(null)} />
    </>
  )
}
