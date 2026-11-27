import { useEffect, useMemo, useState } from 'react'
import { FileText, Search, Star } from 'lucide-react'
import { ManualSearchPanel } from '../components/ManualSearchPanel'
import { SourceDrawer } from '../components/SourceDrawer'
import type { ManualSearchHit } from '../api/manuals'
import { useI18n } from '../i18n/I18nContext'
import { readRecentPages } from '../lib/manuals'
import type { ManualSearchIntent } from '../lib/workflow'

interface CatalogDoc {
  doc_id: string
  title: string
  pages: number
}

interface ManualsViewProps {
  engineModel: string | null
  isVisible: boolean
  chatEngineModel: string | null
  chatTargetLabel?: string
  vehicleContext?: { vehicleId: string; sessionId: string; engineModel: string }
  searchIntent?: ManualSearchIntent | null
  onSearchIntentConsumed?: () => void
  onAskInChat?: (text: string, engine: string, evidenceId: string, evidenceLabel: string) => void
  onBack?: () => void
  backLabel?: string
}

const FAV_KEY = 'judrive-manual-fav'

export function ManualsView({ engineModel, isVisible, chatEngineModel, chatTargetLabel, vehicleContext, searchIntent, onSearchIntentConsumed, onAskInChat, onBack, backLabel }: ManualsViewProps) {
  const { t } = useI18n()
  const [engines, setEngines] = useState<{ engine_model: string; documents: CatalogDoc[] }[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [engine, setEngine] = useState(searchIntent?.engineModel ?? engineModel ?? '')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [tab, setTab] = useState<'all' | 'fav' | 'recent'>('all')
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAV_KEY))
  const [recent, setRecent] = useState(readRecentPages)
  const [open, setOpen] = useState<ManualSearchHit | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setCatalogLoading(true)
    fetch('/api/manuals/catalog', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<{ engines?: { engine_model: string; documents: CatalogDoc[] }[] }>
      })
      .then((body) => {
        if (controller.signal.aborted) return
        const list = body.engines ?? []
        setEngines(list)
        setCatalogError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEngines([])
          setCatalogError(true)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [catalogRevision])

  useEffect(() => { if (!isVisible) setOpen(null) }, [isVisible])

  const allDocs = useMemo(() => {
    const byId = new Map<string, CatalogDoc & { engines: string[] }>()
    for (const group of engines) {
      for (const doc of group.documents) {
        const known = byId.get(doc.doc_id)
        if (known) known.engines.push(group.engine_model)
        else byId.set(doc.doc_id, { ...doc, engines: [group.engine_model] })
      }
    }
    return [...byId.values()]
  }, [engines])
  const docs = useMemo(() => {
    const rows = engine ? allDocs.filter((doc) => doc.engines.includes(engine)) : allDocs
    let selected: typeof allDocs
    if (tab === 'all') {
      selected = rows
    } else {
      const byId = new Map(rows.map((doc) => [doc.doc_id, doc]))
      const ids = tab === 'fav' ? favorites : recent.map(({ docId }) => docId)
      selected = ids.flatMap((id) => {
        const doc = byId.get(id)
        return doc ? [doc] : []
      })
    }
    const query = catalogQuery.trim().toLowerCase()
    if (!query) return selected
    return selected.filter((doc) => [doc.title, doc.doc_id, ...doc.engines]
      .some((field) => field.toLowerCase().includes(query)))
  }, [allDocs, catalogQuery, engine, favorites, recent, tab])

  const [openedEngine, setOpenedEngine] = useState('')
  const openDoc = (doc: CatalogDoc & { engines: string[] }, page: number) => {
    setOpenedEngine(doc.engines.includes(engine) ? engine : doc.engines[0])
    setOpen({
      evidence_id: doc.doc_id,
      doc_id: doc.doc_id,
      manual_title: doc.title,
      pdf_page: page,
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
          <h1>{t('nav.manuals')}</h1>
          <p>{t('manuals.subtitle')}</p>
        </div>
        {onBack ? (
          <button type="button" className="btn btn--secondary" onClick={onBack}>
            {backLabel ? `← ${backLabel}` : t('action.backDiagnosis')}
          </button>
        ) : null}
      </header>

      <section className="panel manual-catalog-panel" aria-busy={catalogLoading}>
        <div className="manual-toolbar">
          <label className="field">
            <span>{t('diag.engine')}</span>
            <select value={engine} onChange={(event) => setEngine(event.target.value)} disabled={catalogLoading}>
              <option value="">{t('chief.filter.all')}</option>
              {engine && !engines.some((row) => row.engine_model === engine) ? (
                <option value={engine}>{engine}</option>
              ) : null}
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
                type="search"
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
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {id === 'all' ? t('chief.filter.all') : id === 'fav' ? t('manuals.favorite') : t('manuals.recent')}
            </button>
          ))}
          <span className="manual-tabs__count">{t('fleet.count', { shown: docs.length, total: allDocs.length })}</span>
        </div>

        {catalogLoading ? <p className="panel__subtitle">{t('tickets.loading')}</p> : null}
        {catalogError ? (
          <div className="panel__error" role="alert">
            <span>{t('error.manualsCatalog')}</span>
            <button type="button" className="btn btn--secondary" onClick={() => setCatalogRevision((value) => value + 1)}>
              {t('history.retry')}
            </button>
          </div>
        ) : null}
        {!catalogLoading && !catalogError ? (
          <ul className="manual-catalog">
            {docs.map((doc) => {
              const page = tab === 'recent' ? recent.find((entry) => entry.docId === doc.doc_id)?.page ?? 1 : 1
              const guideLabel = doc.doc_id.endsWith('-re') ? t('manuals.operationGuide') : t('manuals.repairGuide')
              const engineLabel = engine && doc.engines.includes(engine) ? engine : doc.engines.join(', ')
              return (
                <li key={doc.doc_id}>
                  <article className="manual-card">
                    <div className="manual-card__head">
                      <span className="manual-card__icon" aria-hidden>
                        <FileText size={20} />
                      </span>
                      <div>
                        <h3 className="manual-card__title">{engineLabel} · {guideLabel}</h3>
                        <p className="manual-card__engine">
                          {doc.title} · {t('manuals.pages', { count: doc.pages })}
                          {tab === 'recent' ? ` · ${t('source.pdfPage', { page })}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="manual-card__actions">
                      <button type="button" className="btn btn--primary" onClick={() => openDoc(doc, page)}>
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
                          try { localStorage.setItem(FAV_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
                        }}
                      >
                        <Star size={18} fill={favorites.includes(doc.doc_id) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        ) : null}
        {!catalogLoading && !catalogError && docs.length === 0 ? <p className="empty-state__text">{emptyText}</p> : null}
      </section>

      <ManualSearchPanel
        isVisible={isVisible}
        vehicleContext={vehicleContext}
        chatTargetLabel={chatTargetLabel}
        engineModel={(searchIntent?.engineModel ?? engine) || null}
        searchIntent={searchIntent}
        onSearchIntentConsumed={onSearchIntentConsumed}
        onAskInChat={engine === chatEngineModel ? onAskInChat : undefined}
        onRecentChange={setRecent}
      />
      <SourceDrawer scope={{ engineModel: openedEngine }} hit={isVisible ? open : null} onClose={() => setOpen(null)} onRecentChange={setRecent} />
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
