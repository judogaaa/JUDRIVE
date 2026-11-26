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
