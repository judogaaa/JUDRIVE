import { useEffect, useRef, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import type { ManualSearchHit } from '../api/manuals'
import { pdfSourceUrl } from '../api/manuals'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface SourceDrawerProps {
  hit: ManualSearchHit | null
  onClose: () => void
}

export function SourceDrawer({ hit, onClose }: SourceDrawerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    if (!hit || !canvasRef.current) return
    let cancelled = false
    const render = async () => {
      setRenderError(null)
      try {
        const loadingTask = pdfjs.getDocument({ url: pdfSourceUrl(hit.doc_id, hit.pdf_page) })
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(hit.pdf_page)
        const viewport = page.getViewport({ scale: 1.2 })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const context = canvas.getContext('2d')
        if (!context) return
        canvas.height = viewport.height
        canvas.width = viewport.width
        await page.render({ canvasContext: context, viewport, canvas }).promise
      } catch (err: unknown) {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : 'Не удалось отрисовать PDF')
        }
      }
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [hit])

  if (!hit) return null

  return (
    <div className="source-drawer" role="dialog" aria-modal="true">
      <div className="source-drawer__backdrop" onClick={onClose} />
      <div className="source-drawer__panel">
        <header className="source-drawer__header">
          <div>
            <p className="source-drawer__eyebrow">Источник</p>
            <h3>{hit.manual_title}</h3>
            <p className="source-drawer__meta">Физическая страница PDF: {hit.pdf_page}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть панель источника">
            <X size={18} aria-hidden />
          </button>
        </header>
        <blockquote className="source-drawer__quote">{hit.quote}</blockquote>
        <div className="source-drawer__canvas-wrap">
          <canvas ref={canvasRef} />
        </div>
        {renderError ? <p className="panel__error">{renderError}</p> : null}
        <a className="ghost-button" href={pdfSourceUrl(hit.doc_id, hit.pdf_page)} target="_blank" rel="noreferrer">
          <ExternalLink size={16} aria-hidden />
          Открыть PDF
        </a>
      </div>
    </div>
  )
}