import { useEffect, useState } from 'react'
import { BookOpen, ChevronRight, RotateCcw } from 'lucide-react'
import { searchManuals, type ManualSearchHit, type ManualSearchResponse } from '../api/manuals'
import { useI18n } from '../i18n/I18nContext'
import { SourceDrawer } from './SourceDrawer'

/** Search data only; these are leads for investigation, not a diagnosis or repair authorization. */
export function RelatedManuals({ engineModel, query, vehicleId, sessionId }: { engineModel: string; query: string; vehicleId: string; sessionId: string }) {
  const { locale, t } = useI18n()
  const [data, setData] = useState<ManualSearchResponse | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [opened, setOpened] = useState<ManualSearchHit | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    // oxlint-disable-next-line react/set-state-in-effect -- Discard results before querying another engine.
    setData(null)
    setError(false)
    searchManuals(engineModel, query, 8, ctrl.signal, { vehicleId, sessionId })
      .then((response) => { if (!ctrl.signal.aborted) setData(response) })
      .catch(() => { if (!ctrl.signal.aborted) setError(true) })
    return () => ctrl.abort()
  }, [engineModel, query, retry, vehicleId, sessionId])
  return (
    <section className="panel related-manuals" aria-live="polite">
      <h3 className="panel__title"><BookOpen size={17} aria-hidden /> {t('verdict.related.title')}</h3>
      <p className="panel__subtitle">{t('verdict.related.hint')}</p>
      {!data && !error && <p className="panel__subtitle">{t('manual.searching')}</p>}
      {data?.status === 'conflict' || data?.status === 'potential_conflict' ? (
        <p className={data.status === 'potential_conflict' ? 'manual-refusal manual-refusal--potential' : 'manual-refusal'}>{data.message}</p>
      ) : null}
      {error || (data && !['ok', 'conflict', 'potential_conflict', 'not_found'].includes(data.status)) ? (
        <>
          {locale === 'ru' && data?.message ? <p className="panel__subtitle">{data.message}</p> : null}
          <button type="button" className="btn btn--secondary" onClick={() => setRetry((n) => n + 1)}>
            <RotateCcw size={15} aria-hidden /> {t('history.retry')}
          </button>
        </>
      ) : data?.status === 'not_found' ? (
        <p className="panel__subtitle">{locale === 'ru' ? data.message || t('manual.refusalTitle') : t('manual.refusalTitle')}</p>
      ) : (
        <ul className="history-list" style={{ marginTop: '0.75rem' }}>
          {(data?.status === 'conflict' || data?.status === 'potential_conflict' ? data.conflicting_sources : data?.results.slice(0, 3))?.map((hit) => (
            <li key={hit.evidence_id}>
              <button type="button" className="history-item" onClick={() => setOpened(hit)}>
                <span className="history-item__id">{hit.manual_title}</span>
                <span className="history-item__date">{t('source.pdfPage', { page: hit.pdf_page })} <ChevronRight size={14} aria-hidden /></span>
                {hit.condition ? <span className="history-item__condition">{hit.condition}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <SourceDrawer scope={{ engineModel, vehicleId, sessionId }} hit={opened} onClose={() => setOpened(null)} />
    </section>
  )
}
