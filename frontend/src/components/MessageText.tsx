import { Fragment, type ReactNode } from 'react'
import type { SourceHit } from '../api/chat'
import { useI18n } from '../i18n/I18nContext'

/**
 * Small, safe renderer for the lightweight Markdown used by the agent:
 * paragraphs, bullet/numbered lists, bold runs and headings. It never injects
 * HTML, so text coming from the model stays plain data.
 */
type MessageTextProps = {
  text: string
  sources?: SourceHit[]
  onOpenSource?: (source: SourceHit) => void
  loadingSourceId?: string | null
}

export function MessageText({ text, sources = [], onOpenSource, loadingSourceId }: MessageTextProps) {
  const { t } = useI18n()
  const known = new Map(sources.map((source) => [source.evidence_id, source]))
  function renderInline(line: string): ReactNode[] {
    return line.split(/(\*\*[^*]+\*\*|\[[a-z][a-z0-9-]*:p\d{1,6}\])/gi).map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={index}>{renderInline(part.slice(2, -2))}</strong>
      }
      const source = known.get(part.slice(1, -1))
      if (source && onOpenSource) {
        const label = `${source.manual_title}, ${t('ticket.pdfPage')} ${source.pdf_page}`
        return <button key={index} type="button" className="chat-citation"
          title={label} aria-label={label} disabled={loadingSourceId === source.evidence_id}
          onClick={() => onOpenSource(source)}>{t('ticket.pdfPage')} {source.pdf_page}</button>
      }
      return <Fragment key={index}>{part}</Fragment>
    })
  }
  return <div className="chat-bubble__text">{renderBlocks(text, renderInline)}</div>
}

function renderBlocks(text: string, renderInline: (line: string) => ReactNode[]): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (heading) {
      blocks.push(
        <p key={`h-${index}`} className="chat-bubble__heading">
          {renderInline(heading[1].trim() || line.trim())}
        </p>,
      )
      index += 1
      continue
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (index < lines.length && /^\s*[-*•]\s+/.test(lines[index])) {
        items.push(<li key={index}>{renderInline(lines[index].replace(/^\s*[-*•]\s+/, ''))}</li>)
        index += 1
      }
      blocks.push(<ul key={`ul-${index}`}>{items}</ul>)
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(<li key={index}>{renderInline(lines[index].replace(/^\s*\d+[.)]\s+/, ''))}</li>)
        index += 1
      }
      blocks.push(<ol key={`ol-${index}`}>{items}</ol>)
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*[-*•]\s+/.test(lines[index]) &&
      !/^\s*\d+[.)]\s+/.test(lines[index]) &&
      !/^#{1,4}\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(
      <p key={`p-${index}`}>
        {paragraph.map((part, partIndex) => (
          <Fragment key={partIndex}>
            {partIndex > 0 ? <br /> : null}
            {renderInline(part)}
          </Fragment>
        ))}
      </p>,
    )
  }

  return blocks
}
