import type { SourceHit } from '../api/chat'

const citationPattern = /\[([a-z][a-z0-9-]*:p\d{1,6})\]/gi

export function readableAnswer(text: string, sources: SourceHit[], pageLabel: string): string {
  const known = new Map(sources.map((source) => [source.evidence_id, source]))
  return text.replace(citationPattern, (original, id: string) => {
    const source = known.get(id)
    return source ? `(${source.manual_title}, ${pageLabel} ${source.pdf_page})` : original
  })
}
