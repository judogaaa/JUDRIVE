import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import { searchManuals, type ManualSearchHit, type ManualSearchResponse } from '../api/manuals'
import type { ManualSearchIntent } from '../lib/workflow'
import { useI18n } from '../i18n/I18nContext'
import { resolveErrorMessage } from '../lib/i18nError'
import { CopyButton } from './CopyButton'
import { SourceDrawer } from './SourceDrawer'

interface ManualSearchPanelProps {
  engineModel: string | null
  searchIntent?: ManualSearchIntent | null
  onSearchIntentConsumed?: () => void
  onAskInChat?: (text: string) => void
}

const QUICK_QUERIES = [
  'тепловые зазоры клапанного механизма',
  'момент затяжки крышек коренных подшипников',
  'давление масла',
]

const GENERAL_INSPECTION_QUERY = 'осмотр двигателя техническое обслуживание'

export function ManualSearchPanel({ engineModel, searchIntent, onSearchIntentConsumed, onAskInChat }: ManualSearchPanelProps) {
  const { locale, t } = useI18n()
  const [query, setQuery] = useState(QUICK_QUERIES[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<ManualSearchResponse | null>(null)
  const [active, setActive] = useState<ManualSearchHit | null>(null)
  const lastIntentRef = useRef<number | null>(null)
  const requestRef = useRef(0)
  const mountedRef = useRef(true)
  const lastEngineRef = useRef(engineModel)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (lastEngineRef.current === engineModel) return
    lastEngineRef.current = engineModel
    // Results belong to one engine. Never show ЯМЗ pages after switching to ЗМЗ.
    requestRef.current += 1
    setPayload(null)
    setError(null)
    setActive(null)
    setLoading(false)
  }, [engineModel])

  const disabled = !engineModel || loading

  const hint = useMemo(() => {
    if (!engineModel) return t('manual.hintNoVehicle')
    return `${t('manual.hintEngine')} «${engineModel}».`
  }, [engineModel, t])

  const runSearch = useCallback(
    async (q: string, autoOpenSingle?: boolean) => {
      if (!engineModel || !q.trim()) return
      const request = ++requestRef.current
      setLoading(true)
      setError(null)
      setPayload(null)
      setActive(null)
      try {
        const result = await searchManuals(engineModel, q.trim(), 6)
        if (!mountedRef.current || request !== requestRef.current) return
        setPayload(result)
        if (autoOpenSingle && result.results?.length === 1) {
          setActive(result.results[0])
        }
      } catch (err: unknown) {
        if (!mountedRef.current || request !== requestRef.current) return
        setError(resolveErrorMessage(t, err, 'error.manualSearch'))
      } finally {
        if (mountedRef.current && request === requestRef.current) setLoading(false)
      }
    },
    [engineModel, t],
  )

  useEffect(() => {
    if (!searchIntent || searchIntent.id === lastIntentRef.current) return
    lastIntentRef.current = searchIntent.id
    setQuery(searchIntent.query)
    void runSearch(searchIntent.query, searchIntent.autoOpenSingle).finally(() => onSearchIntentConsumed?.())
  }, [onSearchIntentConsumed, runSearch, searchIntent])

  const refusal = payload?.status === 'not_found' || payload?.status === 'unsupported_engine'
  const canOfferGeneral = refusal && payload?.status === 'not_found' && query.trim() !== GENERAL_INSPECTION_QUERY

  return (
    <section className="panel manual-panel">
      <div className="manual-panel__head">
        <span className="manual-panel__icon" aria-hidden>
          <BookOpen size={20} />
        </span>
        <div>
          <h2 className="panel__title">{t('manual.title')}</h2>
          <p className="panel__subtitle">{hint}</p>
        </div>
      </div>

      <form
        className="manual-query-row"
        onSubmit={(event) => {
          event.preventDefault()
          void runSearch(query)
        }}
      >
        <label className="field manual-query-field">
          <span>{t('manual.query')}</span>
          <div className="search-field">
            <Search size={18} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('manual.queryPlaceholder')}
            />
          </div>
        </label>
        <button type="submit" className="btn btn--primary" disabled={disabled || !query.trim()}>
          {loading ? t('manual.searching') : t('manual.search')}
        </button>
      </form>

      <div className="chip-row manual-quick-queries">
        {QUICK_QUERIES.map((item) => (
          <button
            key={item}
            type="button"
            className="chip-button"
            disabled={disabled}
            onClick={() => {
              setQuery(item)
              void runSearch(item)
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {error ? (
        <div className="panel__error manual-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn--secondary" onClick={() => void runSearch(query)}>
            {t('history.retry')}
          </button>
        </div>
      ) : null}

      {refusal ? (
        <div className="manual-refusal" role="status">
          <strong>{t('manual.refusalTitle')}</strong>
          {locale === 'ru' && payload?.message ? <p>{payload.message}</p> : null}
          {canOfferGeneral ? (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={disabled}
              onClick={() => {
                setQuery(GENERAL_INSPECTION_QUERY)
                void runSearch(GENERAL_INSPECTION_QUERY)
              }}
            >
              {t('manual.fallbackGeneral')}
            </button>
          ) : null}
        </div>
      ) : null}

      {payload?.results?.length ? (
        <ul className="manual-results">
          {payload.results.map((hit) => (
            <li key={hit.evidence_id} className="manual-result">
              <div className="manual-result__head">
                <span className="manual-result__doc">{hit.manual_title}</span>
                <span className="manual-result__page">PDF {hit.pdf_page}</span>
              </div>
              <blockquote className="manual-result__quote">{hit.quote}</blockquote>
              <div className="message-actions">
                <button type="button" className="ghost-button" onClick={() => setActive(hit)}>
                  {t('manual.openSource')}
                </button>
                <CopyButton text={`${hit.manual_title}, ${t('ticket.pdfPage')} ${hit.pdf_page}\n${hit.quote}`} />
                {onAskInChat ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() =>
                      onAskInChat(
                        `${t('action.askSource')}\n${hit.manual_title}, ${t('ticket.pdfPage')} ${hit.pdf_page}\n${hit.quote}`,
                      )
                    }
                  >
                    {t('action.toChat')}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <SourceDrawer hit={active} onClose={() => setActive(null)} />
    </section>
  )
}
