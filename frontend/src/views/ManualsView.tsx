import { useEffect, useMemo, useState } from 'react'
import { FileText, Star } from 'lucide-react'
import { ManualSearchPanel } from '../components/ManualSearchPanel'
import { SourceDrawer } from '../components/SourceDrawer'
import type { ManualSearchHit } from '../api/manuals'
import { useI18n } from '../i18n/I18nContext'

interface CatalogDoc {
  doc_id: string
  title: string
  pages: number
  engine_model?: string
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
  const [tab, setTab] = useState<'all' | 'fav' | 'recent'>('all')
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAV_KEY))
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY))
  const [open, setOpen] = useState<ManualSearchHit | null>(null)

  useEffect(() => {
    void fetch('/api/manuals/catalog')
      .then((r) => r.json())
      .then((body: { engines?: { engine_model: string; documents: CatalogDoc[] }[] }) => {
        const list = body.engines ?? []
        setEngines(list)
        setEngine((prev) => prev || engineModel || list[0]?.engine_model || '')
      })
      .catch(() => setEngines([]))
  }, [engineModel])

  const docs = useMemo(() => {
    const rows = engines.find((row) => row.engine_model === engine)?.documents ?? []
    if (tab === 'fav') return rows.filter((d) => favorites.includes(d.doc_id))
    if (tab === 'recent') return rows.filter((d) => recent.includes(d.doc_id))
    return rows
  }, [engines, engine, tab, favorites, recent])

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

  return (
    <div className="manual-sections">
      <header className="page-header page-header--compact">
        <h1>{t('nav.manuals')}</h1>
      </header>
      <section className="panel">
        <div className="toolbar-bar">
          <label className="field">
            <span>{t('diag.engine')}</span>
            <select value={engine} onChange={(e) => setEngine(e.target.value)}>
              {engines.map((row) => (
                <option key={row.engine_model} value={row.engine_model}>{row.engine_model}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="chief-tabs">
          {(['all', 'fav', 'recent'] as const).map((id) => (
            <button key={id} type="button" className={tab === id ? 'chip-button chip-button--on' : 'chip-button'} onClick={() => setTab(id)}>
              {id === 'all' ? t('chief.filter.all') : id === 'fav' ? t('manuals.favorite') : t('manuals.recent')}
            </button>
          ))}
        </div>
        <ul className="manual-catalog">
          {docs.map((doc) => (
            <li key={doc.doc_id}>
              <article className="manual-card">
                <div className="manual-card__head">
                  <span className="manual-card__icon" aria-hidden><FileText size={20} /></span>
                  <div>
                    <h3 className="manual-card__title">{doc.title}</h3>
                    <p className="manual-card__engine">{engine} · {t('manuals.pages', { count: doc.pages })}</p>
                  </div>
                </div>
                <div className="manual-card__actions">
                  <button type="button" className="btn btn--primary" onClick={() => openDoc(doc)}>{t('manuals.open')}</button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('manuals.favorite')}
                    onClick={() => {
                      const next = favorites.includes(doc.doc_id) ? favorites.filter((id) => id !== doc.doc_id) : [doc.doc_id, ...favorites]
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
      </section>
      <ManualSearchPanel engineModel={engine || null} />
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