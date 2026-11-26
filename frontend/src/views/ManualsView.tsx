import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Search, Star } from 'lucide-react'
import { ManualSearchPanel } from '../components/ManualSearchPanel'
import { SourceDrawer } from '../components/SourceDrawer'
import type { ManualSearchHit } from '../api/manuals'
import { useI18n } from '../i18n/I18nContext'
import type { ManualSearchIntent } from '../lib/workflow'

interface CatalogDoc {
  doc_id: string
  title: string
  pages: number
  engine_model?: string
}

interface ManualsViewProps {
  engineModel: string | null
  searchIntent?: ManualSearchIntent | null
  onSearchIntentConsumed?: () => void
  onAskInChat?: (text: string) => void
  onBack?: () => void
}

const FAV_KEY = 'judrive-manual-fav'
const RECENT_KEY = 'judrive-manual-recent'

export function ManualsView({ engineModel, searchIntent, onSearchIntentConsumed, onAskInChat, onBack }: ManualsViewProps) {
  const { t } = useI18n()
  const [engines, setEngines] = useState<{ engine_model: string; documents: CatalogDoc[] }[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)
  const [engine, setEngine] = useState(engineModel ?? '')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [tab, setTab] = useState<'all' | 'fav' | 'recent'>('all')
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAV_KEY))
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY))
  const [open, setOpen] = useState<ManualSearchHit | null>(null)
  const engineModelRef = useRef(engineModel)
  engineModelRef.current = engineModel

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)
    fetch('/api/manuals/catalog')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<{ engines?: { engine_model: string; documents: CatalogDoc[] }[] }>
      })
      .then((body) => {
        if (cancelled) return
        const list = body.engines ?? []
        setEngines(list)
        setEngine((prev) => {
          if (prev && list.some((row) => row.engine_model === prev)) return prev
          const current = engineModelRef.current
          if (current && list.some((row) => row.engine_model === current)) return current
          return list[0]?.engine_model ?? ''
        })
        setCatalogError(false)
      })
      .catch(() => {
        if (!cancelled) {
          setEngines([])
          setCatalogError(true)
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Follow the vehicle selected in diagnosis unless the mechanic is already in the same engine group.
  useEffect(() => {
    if (!engineModel) return
    if (engines.some((row) => row.engine_model === engineModel)) setEngine(engineModel)
  }, [engineModel, engines])

  const docs = useMemo(() => {
    const rows = engines.find((row) => row.engine_model === engine)?.documents ?? []
    const selected =
      tab === 'fav' ? rows.filter((doc) => favorites.includes(doc.doc_id)) : tab === 'recent' ? rows.filter((doc) => recent.includes(doc.doc_id)) : rows
    const query = catalogQuery.trim().toLowerCase()
    if (!query) return selected
    return selected.filter((doc) => doc.title.toLowerCase().includes(query) || doc.doc_id.toLowerCase().includes(query))
  }, [catalogQuery, engine, engines, favorites, recent, tab])

  const remember = (docId: string) => {
    const next = [docId, ...recent.filter((id) => id !== docId)].slice(0, 6)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  }

  const openDoc = (doc: CatalogDoc) => {
    remember(doc.doc_id)
    setOpen({
      evidence_id: doc.doc_id,
      doc_id: doc.doc_id,
      manual_title: doc.title,
      pdf_page: 1,
      quote: '',
      score: 0,
      extraction: 'text',
    })
  }

  const emptyText =
    tab === 'fav' ? t('manuals.noFavorites') : tab === 'recent' ? t('manuals.noRecent') : t('manuals.noDocs')

  return (
    <div className="manual-sections">
      <header className="page-header page-header--compact manual-header">
        <div>
          <p className="eyebrow">{t('nav.manuals')}</p>
          <h1>{t('nav.manuals')}</h1>
          <p>{t('manuals.subtitle')}</p>
        </div>
        {onBack ? (
          <button type="button" className="btn btn--secondary" onClick={onBack}>
            {t('action.backDiagnosis')}
          </button>
        ) : null}
      </header>

      <section className="panel manual-catalog-panel">
        <div className="manual-toolbar">
          <label className="field">
            <span>{t('diag.engine')}</span>
            <select value={engine} onChange={(event) => setEngine(event.target.value)} disabled={catalogLoading}>
              {engines.map((row) => (
                <option key={row.engine_model} value={row.engine_model}>
                  {row.engine_model}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('manuals.searchCatalog')}</span>
            <div className="search-field">
              <Search size={18} aria-hidden />
              <input
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder={t('manuals.searchCatalogPlaceholder')}
              />
            </div>
          </label>
        </div>

        <div className="chip-row manual-tabs">
          {(['all', 'fav', 'recent'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'chip-button chip-button--on' : 'chip-button'}
              onClick={() => setTab(id)}
            >
              {id === 'all' ? t('chief.filter.all') : id === 'fav' ? t('manuals.favorite') : t('manuals.recent')}
            </button>
          ))}
          <span className="manual-tabs__count">{t('fleet.count', { shown: docs.length, total: engines.find((row) => row.engine_model === engine)?.documents.length ?? 0 })}</span>
        </div>

        {catalogLoading ? <p className="panel__subtitle">{t('tickets.loading')}</p> : null}
        {catalogError ? <p className="panel__error">{t('error.manualsCatalog')}</p> : null}
        {!catalogLoading && !catalogError ? (
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
                        {engine} · {t('manuals.pages', { count: doc.pages })}
                      </p>
                    </div>
                  </div>
                  <div className="manual-card__actions">
                    <button type="button" className="btn btn--primary" onClick={() => openDoc(doc)}>
                      {t('manuals.open')}
                    </button>
                    <button
                      type="button"
                      className={favorites.includes(doc.doc_id) ? 'icon-btn icon-btn--active' : 'icon-btn'}
                      aria-pressed={favorites.includes(doc.doc_id)}
                      aria-label={favorites.includes(doc.doc_id) ? t('manuals.favorited') : t('manuals.favorite')}
                      title={favorites.includes(doc.doc_id) ? t('manuals.favorited') : t('manuals.favorite')}
                      onClick={() => {
                        const next = favorites.includes(doc.doc_id)
                          ? favorites.filter((id) => id !== doc.doc_id)
                          : [doc.doc_id, ...favorites]
                        setFavorites(next)
                        localStorage.setItem(FAV_KEY, JSON.stringify(next))
                      }}
                    >
                      <Star size={18} fill={favorites.includes(doc.doc_id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : null}
        {!catalogLoading && !catalogError && docs.length === 0 ? <p className="empty-state__text">{emptyText}</p> : null}
      </section>

      <ManualSearchPanel
        engineModel={(searchIntent?.engineModel ?? engine) || null}
        searchIntent={searchIntent}
        onSearchIntentConsumed={onSearchIntentConsumed}
        onAskInChat={onAskInChat}
      />
      <SourceDrawer hit={open} onClose={() => setOpen(null)} />
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
