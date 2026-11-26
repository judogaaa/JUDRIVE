import { Fragment, type ReactNode } from 'react'

/**
 * Small, safe renderer for the lightweight Markdown used by the agent:
 * paragraphs, bullet/numbered lists, bold runs and headings. It never injects
 * HTML, so text coming from the model stays plain data.
 */
export function MessageText({ text }: { text: string }) {
  return <div className="chat-bubble__text">{renderBlocks(text)}</div>
}

function renderInline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}

function renderBlocks(text: string): ReactNode[] {
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
