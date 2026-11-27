export type RecentPage = { docId: string; page: number }

const RECENT_KEY = 'judrive-manual-recent'

export function readRecentPages(): RecentPage[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.flatMap((item) => {
      if (typeof item === 'string') return [{ docId: item, page: 1 }]
      if (typeof item?.docId === 'string' && Number.isInteger(item.page) && item.page > 0) {
        return [{ docId: item.docId, page: item.page }]
      }
      return []
    })
  } catch {
    return []
  }
}

export function rememberManualPage(docId: string, page: number): RecentPage[] {
  const next = [{ docId, page }, ...readRecentPages().filter((item) => item.docId !== docId)].slice(0, 6)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  return next
}

const MANUAL_DOC_IDS: [string, string][] = [
  ['236-3902150', 'y236-re'],
  ['236.01.01', 'y236-rk'],
  ['536.3902150', 'y536-re'],
  ['536.01.02', 'y536-rk'],
  ['5234', 'z5234-rk'],
  ['409', 'z409-rk'],
]

/**
 * Maps a manual title coming from a ticket snapshot to a PDF allowlisted doc_id.
 * Unknown titles return an empty string and must be rendered as plain text.
 */
export function docIdFromManualTitle(title: string): string {
  return MANUAL_DOC_IDS.find(([needle]) => title.includes(needle))?.[1] ?? ''
}
