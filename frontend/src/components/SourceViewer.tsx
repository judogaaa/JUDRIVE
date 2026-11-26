import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minimize2, Minus, Plus, RotateCcw, X } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import type { ManualSearchHit } from '../api/manuals'
import { pdfDocUrl, pdfSourceUrl } from '../api/manuals'
import { useI18n } from '../i18n/I18nContext'
import { CopyButton } from './CopyButton'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

interface SourceViewerProps {
  hit: ManualSearchHit | null
  onClose: () => void
}

export function SourceViewer({ hit, onClose }: SourceViewerProps) {
  return hit ? <SourceViewerBody key={`${hit.doc_id}:${hit.pdf_page}`} hit={hit} onClose={onClose} /> : null
}

function SourceViewerBody({ hit, onClose }: { hit: ManualSearchHit; onClose: () => void }) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [full, setFull] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [availableWidth, setAvailableWidth] = useState(460)
  const [pageNumber, setPageNumber] = useState(hit.pdf_page)
  const [pageInput, setPageInput] = useState(String(hit.pdf_page))
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [loadingPdf, setLoadingPdf] = useState(true)
  const [rendering, setRendering] = useState(true)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const oldFocus = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key === 'Tab') {
        const dialog = closeRef.current?.closest('[role="dialog"]')
        const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), summary, textarea:not([disabled])') ?? [])
          .filter((node) => node.getClientRects().length > 0)
        const first = focusable[0], last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = oldOverflow
      oldFocus?.focus()
    }
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => setAvailableWidth(Math.max(100, wrap.clientWidth - 24))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  // Loading is independent of zoom, language, view size, and page navigation.
  useEffect(() => {
    let cancelled = false
    setPdfDoc(null)
    setFailed(false)
    setLoadingPdf(true)
    setRendering(true)
    const loadingTask = pdfjs.getDocument({ url: pdfDocUrl(hit.doc_id) })
    void loadingTask.promise.then((pdf) => {
      if (cancelled) return
      if (hit.pdf_page < 1 || hit.pdf_page > pdf.numPages) throw new Error('Source page outside document')
      setPdfDoc(pdf)
      setPageNumber(hit.pdf_page)
    }).catch(() => {
      if (!cancelled) { setFailed(true); setRendering(false) }
    }).finally(() => {
      if (!cancelled) setLoadingPdf(false)
    })
    return () => {
      cancelled = true
      void loadingTask.destroy().catch(() => undefined)
    }
  }, [hit.doc_id, hit.pdf_page, retry])

  useEffect(() => { setPageInput(String(pageNumber)) }, [pageNumber])

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    let renderTask: RenderTask | null = null
    setFailed(false)
    setRendering(true)
    void (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber)
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const unit = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: availableWidth / unit.width * zoom })
        const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)))
        canvas.width = Math.ceil(viewport.width * dpr)
        canvas.height = Math.ceil(viewport.height * dpr)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas context unavailable')
        renderTask = page.render({ canvas, canvasContext: context, viewport, transform: [dpr, 0, 0, dpr, 0, 0] })
        await renderTask.promise
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()
    return () => { cancelled = true; renderTask?.cancel() }
  }, [pdfDoc, pageNumber, zoom, availableWidth])

  const numPages = pdfDoc?.numPages ?? 0
  const navigate = (target: number) => {
    if (!numPages || !Number.isInteger(target) || target < 1 || target > numPages) {
      setPageInput(String(pageNumber)); return
    }
    setPageNumber(target)
    setPageInput(String(target))
    if (wrapRef.current) wrapRef.current.scrollTop = 0
  }
  const changeZoom = (delta: number) => setZoom((z) => Math.max(0.5, Math.min(3, Math.round((z + delta) * 100) / 100)))

  return (
    <div className={full ? 'source-drawer source-drawer--full' : 'source-drawer'} role="dialog" aria-modal="true" aria-label={hit.manual_title}>
      <div className="source-drawer__backdrop" onClick={onClose} />
      <div className="source-drawer__panel">
        <header className="source-drawer__header">
          <div>
            <p className="source-drawer__eyebrow">{t('source.eyebrow')}</p>
            <h3>{hit.manual_title}</h3>
            {hit.quote ? <p className="source-drawer__meta">{t('source.pdfPage', { page: hit.pdf_page })}</p> : null}
          </div>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label={t('source.close')}><X size={20} /></button>
        </header>
        {hit.quote ? <details className="source-quote" open={!full}><summary>{t('source.eyebrow')}</summary><blockquote className="source-drawer__quote">{hit.quote}</blockquote><CopyButton text={`${hit.manual_title}, PDF ${hit.pdf_page}\n${hit.quote}`} /></details> : null}
        <div className="source-drawer__tools">
          <div className="pdf-tool-group">
            <button type="button" className="icon-btn" disabled={!numPages || pageNumber <= 1} onClick={() => navigate(pageNumber - 1)} aria-label={t('source.prev')} title={t('source.prev')}><ChevronLeft size={18} /></button>
            <form className="pdf-page-form" onSubmit={(e) => { e.preventDefault(); navigate(Number(pageInput)) }}>
              <input inputMode="numeric" value={pageInput} onChange={(e) => setPageInput(e.target.value)} onBlur={() => navigate(Number(pageInput))} disabled={!numPages} aria-label={t('source.page')} />
              <span>/ {numPages || '—'}</span>
            </form>
            <button type="button" className="icon-btn" disabled={!numPages || pageNumber >= numPages} onClick={() => navigate(pageNumber + 1)} aria-label={t('source.next')} title={t('source.next')}><ChevronRight size={18} /></button>
          </div>
          <div className="pdf-tool-group">
            <button type="button" className="icon-btn" disabled={zoom <= 0.5 || !numPages} onClick={() => changeZoom(-0.25)} aria-label={t('source.zoomOut')} title={t('source.zoomOut')}><Minus size={18} /></button>
            <button type="button" className="btn btn--secondary pdf-fit" onClick={() => setZoom(1)} disabled={!numPages} title={t('source.fit')}>{zoom === 1 ? t('source.fit') : `${Math.round(zoom * 100)}%`}</button>
            <button type="button" className="icon-btn" disabled={zoom >= 3 || !numPages} onClick={() => changeZoom(0.25)} aria-label={t('source.zoomIn')} title={t('source.zoomIn')}><Plus size={18} /></button>
            <button type="button" className="icon-btn" onClick={() => setFull((v) => !v)} aria-label={t(full ? 'source.collapse' : 'source.expand')} title={t(full ? 'source.collapse' : 'source.expand')} aria-pressed={full}>{full ? <Minimize2 size={19} /> : <Maximize2 size={19} />}</button>
          </div>
          {hit.quote && pageNumber !== hit.pdf_page ? <button type="button" className="btn btn--secondary" onClick={() => navigate(hit.pdf_page)}><ArrowLeft size={16} />{t('source.pdfPage', { page: hit.pdf_page })}</button> : null}
        </div>
        <div ref={wrapRef} className="source-drawer__canvas-wrap" aria-busy={loadingPdf || rendering}>
          {(loadingPdf || rendering) && !failed ? <p className="pdf-status" role="status">{t('insight.loading')}</p> : null}
          {failed ? <div className="pdf-status" role="alert"><p>{t('error.pdfRender')}</p><button className="btn btn--secondary" type="button" onClick={() => setRetry((n) => n + 1)}><RotateCcw size={16} />{t('history.retry')}</button></div> : null}
          <canvas ref={canvasRef} aria-label={`${hit.manual_title}, ${t('source.pdfPage', { page: pageNumber })}`} style={{ visibility: failed || loadingPdf || rendering ? 'hidden' : 'visible' }} />
        </div>
        <a className="ghost-button source-external" href={pdfSourceUrl(hit.doc_id, pageNumber)} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden />{t('source.openPdf')}</a>
      </div>
    </div>
  )
}
