import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Maximize2, Minus, Plus, X } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import type { ManualSearchHit } from '../api/manuals'
import { pdfSourceUrl } from '../api/manuals'
import { useI18n } from '../i18n/I18nContext'
import { resolveErrorMessage } from '../lib/i18nError'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface SourceDrawerProps {
  hit: ManualSearchHit | null
  onClose: () => void
}

export function SourceDrawer({ hit, onClose }: SourceDrawerProps) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.15)
  const [full, setFull] = useState(false)

  useEffect(() => {
    if (!hit || !canvasRef.current) return
    let cancelled = false
    const render = async () => {
      setRenderError(null)
      try {
        const loadingTask = pdfjs.getDocument({ url: pdfSourceUrl(hit.doc_id, hit.pdf_page) })
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(hit.pdf_page)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const context = canvas.getContext('2d')
        if (!context) return
        canvas.height = viewport.height
        canvas.width = viewport.width
        await page.render({ canvasContext: context, viewport, canvas }).promise
      } catch (err: unknown) {
        if (!cancelled) {
          setRenderError(resolveErrorMessage(t, err, 'error.pdfRender'))
        }
      }
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [hit, scale, t])

  if (!hit) return null

  return (
    <div className={full ? 'source-drawer source-drawer--full' : 'source-drawer'} role="dialog" aria-modal="true">
      <div className="source-drawer__backdrop" onClick={onClose} />
      <div className="source-drawer__panel">
        <header className="source-drawer__header">
          <div>
            <p className="source-drawer__eyebrow">{t('source.eyebrow')}</p>
            <h3>{hit.manual_title}</h3>
            <p className="source-drawer__meta">{t('source.pdfPage', { page: hit.pdf_page })}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('source.close')}>
            <X size={18} aria-hidden />
          </button>
        </header>
        <blockquote className="source-drawer__quote">{hit.quote}</blockquote>
        <div className="source-drawer__tools">
          <button type="button" className="icon-btn" onClick={() => setScale((s) => Math.max(0.8, Number((s - 0.15).toFixed(2))))} aria-label="-">
            <Minus size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setScale((s) => Math.min(2.2, Number((s + 0.15).toFixed(2))))} aria-label="+">
            <Plus size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setFull((v) => !v)} aria-label="PDF">
            <Maximize2 size={16} />
          </button>
        </div>
        <div className="source-drawer__canvas-wrap">
          <canvas ref={canvasRef} />
        </div>
        {renderError ? <p className="panel__error">{renderError}</p> : null}
        <a className="ghost-button" href={pdfSourceUrl(hit.doc_id, hit.pdf_page)} target="_blank" rel="noreferrer">
          <ExternalLink size={16} aria-hidden />
          {t('source.openPdf')}
        </a>
      </div>
    </div>
  )
}