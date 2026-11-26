import { useMemo, useState } from 'react'
import { searchManuals, type ManualSearchHit, type ManualSearchResponse } from '../api/manuals'
import { SourceDrawer } from './SourceDrawer'

interface ManualSearchPanelProps {
  engineModel: string | null
}

const QUICK_QUERIES = [
  'тепловые зазоры клапанного механизма',
  'момент затяжки крышек коренных подшипников',
  'давление масла',
]

export function ManualSearchPanel({ engineModel }: ManualSearchPanelProps) {
  const [query, setQuery] = useState('тепловые зазоры клапанного механизма')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<ManualSearchResponse | null>(null)
  const [active, setActive] = useState<ManualSearchHit | null>(null)

  const disabled = !engineModel || loading

  const hint = useMemo(() => {
    if (!engineModel) return 'Выберите машину, чтобы ограничить поиск руководствами её двигателя.'
    return `Поиск только по руководствам для «${engineModel}».`
  }, [engineModel])

  const onSearch = async () => {
    if (!engineModel || !query.trim()) return
    setLoading(true)
    setError(null)
    setPayload(null)
    setActive(null)
    try {
      const result = await searchManuals(engineModel, query.trim(), 6)
      setPayload(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка поиска')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel manual-panel">
      <h2 className="panel__title">Поиск по руководству</h2>
      <p className="panel__subtitle">{hint}</p>

      <div className="manual-query-row">
        <label className="field manual-query-field">
          <span>Запрос</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например: момент затяжки болтов"
          />
        </label>
        <button type="button" className="btn btn--primary" disabled={disabled} onClick={() => void onSearch()}>
          {loading ? 'Ищем…' : 'Найти в РЭ/РК'}
        </button>
      </div>

      <div className="chip-row">
        {QUICK_QUERIES.map((item) => (
          <button
            key={item}
            type="button"
            className="chip-button"
            disabled={disabled}
            onClick={() => setQuery(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {error ? <p className="panel__error">{error}</p> : null}

      {payload?.status === 'not_found' || payload?.status === 'unsupported_engine' ? (
        <div className="manual-refusal" role="status">
          <strong>Недостаточно данных в руководствах</strong>
          <p>{payload.message}</p>
        </div>
      ) : null}

      {payload?.results?.length ? (
        <ul className="manual-results">
          {payload.results.map((hit) => (
            <li key={hit.evidence_id} className="manual-result">
              <div className="manual-result__head">
                <span className="manual-result__doc">{hit.manual_title}</span>
                <span className="manual-result__page">PDF стр. {hit.pdf_page}</span>
              </div>
              <blockquote className="manual-result__quote">{hit.quote}</blockquote>
              <button type="button" className="ghost-button" onClick={() => setActive(hit)}>
                Открыть источник
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <SourceDrawer hit={active} onClose={() => setActive(null)} />
    </section>
  )
}