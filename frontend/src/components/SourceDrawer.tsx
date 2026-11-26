import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minus, Plus, X } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import type { ManualSearchHit } from '../api/manuals'
import { pdfDocUrl, pdfSourceUrl } from '../api/manuals'
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
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [loadingPdf, setLoadingPdf] = useState(false)

  useEffect(() => {
    if (!hit) {
      setPdfDoc(null)
      setNumPages(0)
      return
    }
    setPageNumber(hit.pdf_page)
    let cancelled = false
    const load = async () => {
      setLoadingPdf(true)
      setRenderError(null)
      try {
        const loadingTask = pdfjs.getDocument({ url: pdfDocUrl(hit.doc_id) })
        const pdf = await loadingTask.promise
        if (cancelled) return
        setPdfDoc(pdf)
        setNumPages(pdf.numPages)
        const clamped = Math.min(Math.max(1, hit.pdf_page), pdf.numPages)
        setPageNumber(clamped)
      } catch (err: unknown) {
        if (!cancelled) {
          setPdfDoc(null)
          setNumPages(0)
          setRenderError(resolveErrorMessage(t, err, 'error.pdfRender'))
        }
      } finally {
        if (!cancelled) setLoadingPdf(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [hit?.doc_id, hit?.pdf_page, t])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !hit) return
    let cancelled = false
    let renderTask: RenderTask | null = null
    const render = async () => {
      setRenderError(null)
      try {
        const page = await pdfDoc.getPage(pageNumber)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const context = canvas.getContext('2d')
        if (!context) return
        canvas.height = viewport.height
        canvas.width = viewport.width
        renderTask = page.render({ canvasContext: context, viewport, canvas })
        await renderTask.promise
      } catch (err: unknown) {
        if (!cancelled && !(err instanceof Error && err.message?.includes('cancelled'))) {
          setRenderError(resolveErrorMessage(t, err, 'error.pdfRender'))
        }
      }
    }
    void render()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pdfDoc, pageNumber, scale, hit, t])

  if (!hit) return null

  const canPrev = pageNumber > 1
  const canNext = numPages > 0 && pageNumber < numPages

  return (
    <div className={full ? 'source-drawer source-drawer--full' : 'source-drawer'} role="dialog" aria-modal="true">
      <div className="source-drawer__backdrop" onClick={onClose} />
      <div className="source-drawer__panel">
        <header className="source-drawer__header">
          <div>
            <p className="source-drawer__eyebrow">{t('source.eyebrow')}</p>
            <h3>{hit.manual_title}</h3>
            <p className="source-drawer__meta">{t('source.pdfPage', { page: pageNumber })}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('source.close')}>
            <X size={18} aria-hidden />
          </button>
        </header>
        <blockquote className="source-drawer__quote">{hit.quote}</blockquote>
        <div className="source-drawer__tools">
          <button
            type="button"
            className="icon-btn"
            disabled={!canPrev}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            aria-label="←"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={!canNext}
            onClick={() => setPageNumber((p) => Math.min(numPages || p + 1, p + 1))}
            aria-label="→"
          >
            <ChevronRight size={16} />
          </button>
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
          {loadingPdf ? <p className="panel__subtitle">{t('chat.processing')}</p> : null}
          <canvas ref={canvasRef} />
        </div>
        {renderError ? <p className="panel__error">{renderError}</p> : null}
        <a className="ghost-button" href={pdfSourceUrl(hit.doc_id, pageNumber)} target="_blank" rel="noreferrer">
          <ExternalLink size={16} aria-hidden />
          {t('source.openPdf')}
        </a>
      </div>
    </div>
  )
}