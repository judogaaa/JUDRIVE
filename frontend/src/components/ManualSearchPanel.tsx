import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, MessageSquare, Search } from 'lucide-react'
import { searchManuals, type ManualSearchHit, type ManualSearchResponse } from '../api/manuals'
import { useI18n } from '../i18n/I18nContext'
import { resolveErrorMessage } from '../lib/i18nError'
import { SourceDrawer } from './SourceDrawer'
import { CopyButton } from './CopyButton'

interface ManualSearchPanelProps {
  engineModel: string | null
  initialQuery?: string
  onAskInChat?: (text: string) => void
}

const QUICK_QUERIES = [
  'тепловые зазоры клапанного механизма',
  'момент затяжки крышек коренных подшипников',
  'давление масла',
]

// A new engine remounts this panel. Each request also owns its own generation.
export function ManualSearchPanel({ engineModel, initialQuery, onAskInChat }: ManualSearchPanelProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState(initialQuery ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [payload, setPayload] = useState<ManualSearchResponse | null>(null)
  const [active, setActive] = useState<ManualSearchHit | null>(null)
  const generation = useRef(0)
  const panelRef = useRef<HTMLElement>(null)

  const onSearch = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!engineModel || !trimmed) return
    const gen = ++generation.current
    setQuery(text)
    setLoading(true)
    setError(null)
    setPayload(null)
    setActive(null)
    try {
      const result = await searchManuals(engineModel, trimmed, 6)
      if (generation.current !== gen) return
      if (result.engine_model && result.engine_model !== engineModel) throw new Error('Mismatched engine')
      setPayload(result)
      // Open directly only for an unambiguous single search hit; otherwise the
      // mechanic chooses which actual source to view.
      if (result.status === 'ok' && result.results.length === 1 && initialQuery === text) setActive(result.results[0])
    } catch (err: unknown) {
      if (generation.current === gen) setError(err)
    } finally {
      if (generation.current === gen) setLoading(false)
    }
  }, [engineModel, initialQuery])

  useEffect(() => {
    const timer = initialQuery && engineModel ? window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ block: 'start' })
      void onSearch(initialQuery)
    }, 0) : undefined
    return () => { window.clearTimeout(timer); generation.current += 1 }
  }, [initialQuery, engineModel, onSearch])

  const disabled = !engineModel || loading

  return (
    <section ref={panelRef} className="panel manual-panel">
      <h2 className="panel__title">{t('manual.title')}</h2>
      <p className="panel__subtitle">{engineModel ? `${t('manual.hintEngine')} «${engineModel}».` : t('manual.hintNoVehicle')}</p>
      <form className="manual-query-row" onSubmit={(e) => { e.preventDefault(); void onSearch(query) }}>
        <label className="field manual-query-field">
          <span>{t('manual.query')}</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('manual.queryPlaceholder')} maxLength={500} />
        </label>
        <button type="submit" className="btn btn--primary" disabled={disabled || !query.trim()}>
          <Search size={17} />{loading ? t('manual.searching') : t('manual.search')}
        </button>
      </form>
      <div className="chip-row">
        {QUICK_QUERIES.map((item) => (
          <button key={item} type="button" className="chip-button" disabled={disabled} onClick={() => void onSearch(item)}>{item}</button>
        ))}
      </div>
      {loading ? <p className="panel__subtitle" role="status">{t('manual.searching')}</p> : null}
      {error ? <div role="alert" className="history-error"><p className="panel__error">{resolveErrorMessage(t, error, 'error.manualSearch')}</p><button type="button" className="btn btn--secondary" onClick={() => void onSearch(query)}>{t('history.retry')}</button></div> : null}
      {payload && payload.status !== 'ok' ? (
        <div className="manual-refusal" role="status">
          <strong>{payload.status === 'index_unavailable' ? t('error.source') : t('manual.refusalTitle')}</strong>
          <p>{payload.message}</p>
          {payload.status === 'index_unavailable' ? <button type="button" className="btn btn--secondary" onClick={() => void onSearch(query)}>{t('history.retry')}</button> : null}
        </div>
      ) : null}
      {payload?.status === 'ok' && payload.results.length ? (
        <ul className="manual-results">
          {payload.results.map((hit) => {
            const reference = `${hit.manual_title}, PDF ${hit.pdf_page}\n${hit.quote}`
            return (
              <li key={hit.evidence_id} className="manual-result">
                <div className="manual-result__head"><span className="manual-result__doc">{hit.manual_title}</span><span className="manual-result__page">PDF {hit.pdf_page}</span></div>
                <blockquote className="manual-result__quote">{hit.quote}</blockquote>
                <div className="message-actions">
                  <button type="button" className="btn btn--primary" onClick={() => setActive(hit)}><BookOpen size={16} />{t('manual.openSource')}</button>
                  {onAskInChat ? <button type="button" className="btn btn--secondary" onClick={() => onAskInChat(`${engineModel}\n${reference}\n\n${t('action.askSource')}`)}><MessageSquare size={16} />{t('action.toChat')}</button> : null}
                  <CopyButton text={reference} />
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      <SourceDrawer hit={active} onClose={() => setActive(null)} />
    </section>
  )
}
