import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Star } from 'lucide-react'
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
        const list = body.engines ?? []
        setEngines(list)
        setEngine((prev) => {
          if (prev) return prev
          if (engineModel) return engineModel
          return list[0]?.engine_model ?? ''
        })
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
    <div className="manual-sections">
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

        {docs.length ? (
          <ul className="manual-catalog">
            {docs.map((doc) => (
              <li key={doc.doc_id}>
                <article className="manual-card">
                  <div className="manual-card__head">
                    <span className="manual-card__icon" aria-hidden>
                      <FileText size={20} />
                    </span>
                    <div>
                      <h3 className="manual-card__title">{doc.title}</h3>
                      <p className="manual-card__engine">
                        {engine || '—'} · {t('manuals.pages', { count: doc.pages })}
                      </p>
                    </div>
                  </div>
                  <div className="manual-card__actions">
                    <a
                      className="btn btn--primary"
                      href={`/api/sources/pdf/${encodeURIComponent(doc.doc_id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => remember(doc.doc_id)}
                    >
                      <ExternalLink size={16} aria-hidden />
                      {t('manuals.open')}
                    </a>
                    <button
                      type="button"
                      className={`chip-button ${favorites.includes(doc.doc_id) ? 'chip-button--on' : ''}`}
                      onClick={() => toggleFav(doc.doc_id)}
                      aria-pressed={favorites.includes(doc.doc_id)}
                    >
                      <Star size={14} aria-hidden />
                      {favorites.includes(doc.doc_id) ? t('manuals.favorited') : t('manuals.favorite')}
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel__subtitle">{t('manual.hintNoVehicle')}</p>
        )}

        {recent.length ? (
          <p className="panel__subtitle">
            {t('manuals.recent')}: {recent.join(', ')}
          </p>
        ) : null}
      </section>

      <ManualSearchPanel engineModel={engine || null} />
    </div>
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