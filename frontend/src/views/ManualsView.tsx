import { useEffect, useState } from 'react'
import { ManualSearchPanel } from '../components/ManualSearchPanel'
import { useI18n } from '../i18n/I18nContext'

interface CatalogDoc {
  doc_id: string
  title: string
  pages: number
}

interface ManualsViewProps {
  engineModel: string | null
}

const FAV_KEY = 'judrive-manual-fav'
const RECENT_KEY = 'judrive-manual-recent'

export function ManualsView({ engineModel }: ManualsViewProps) {
  const { t } = useI18n()
  const [engines, setEngines] = useState<{ engine_model: string; documents: CatalogDoc[] }[]>([])
  const [engine, setEngine] = useState(engineModel ?? '')
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAV_KEY))
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY))

  useEffect(() => {
    if (!engine && engineModel) setEngine(engineModel)
  }, [engine, engineModel])

  useEffect(() => {
    void fetch('/api/manuals/catalog')
      .then((r) => r.json())
      .then((body: { engines?: { engine_model: string; documents: CatalogDoc[] }[] }) => {
        setEngines(body.engines ?? [])
      })
      .catch(() => setEngines([]))
  }, [])

  const docs = engines.find((row) => row.engine_model === engine)?.documents ?? []

  const remember = (docId: string) => {
    const next = [docId, ...recent.filter((id) => id !== docId)].slice(0, 6)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  }

  const toggleFav = (docId: string) => {
    const next = favorites.includes(docId) ? favorites.filter((id) => id !== docId) : [docId, ...favorites]
    setFavorites(next)
    localStorage.setItem(FAV_KEY, JSON.stringify(next))
  }

  return (
    <>
      <header className="page-header page-header--compact">
        <h1>{t('nav.manuals')}</h1>
      </header>
      <section className="panel">
        <label className="field">
          <span>{t('diag.engine')}</span>
          <select value={engine} onChange={(e) => setEngine(e.target.value)}>
            <option value="">{t('chief.filter.all')}</option>
            {engines.map((row) => (
              <option key={row.engine_model} value={row.engine_model}>
                {row.engine_model}
              </option>
            ))}
          </select>
        </label>
        <ul className="manual-catalog">
          {docs.map((doc) => (
            <li key={doc.doc_id}>
              <button type="button" className="chat-source-link" onClick={() => remember(doc.doc_id)}>
                {doc.title}
              </button>
              <span className="panel__subtitle"> · {doc.pages}</span>
              <button type="button" className="chip-button" onClick={() => toggleFav(doc.doc_id)}>
                {favorites.includes(doc.doc_id) ? '★' : '☆'}
              </button>
            </li>
          ))}
        </ul>
        {recent.length ? <p className="panel__subtitle">{recent.join(' · ')}</p> : null}
      </section>
      <ManualSearchPanel engineModel={engine || null} />
    </>
  )
}

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}
