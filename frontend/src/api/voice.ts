import type { LocaleCode } from '../i18n/translations'
import { i18nError } from '../lib/i18nError'

export async function transcribeAudio(blob: Blob, locale: LocaleCode, signal: AbortSignal): Promise<string> {
  const form = new FormData()
  form.append('file', blob, blob.type.startsWith('audio/mp4') ? 'speech.mp4' : 'speech.webm')
  form.append('locale', locale)
  const signalWithTimeout = AbortSignal.any([signal, AbortSignal.timeout(60_000)])
  let response: Response
  try {
    response = await fetch('/api/voice/transcribe', { method: 'POST', body: form, signal: signalWithTimeout })
  } catch {
    throw i18nError(signalWithTimeout.reason?.name === 'TimeoutError' ? 'error.timeout' : 'error.network')
  }
  if (response.status === 429) throw i18nError('error.agentBusy')
  if (!response.ok) throw i18nError('error.stt', response.status)
  const data = await response.json().catch(() => null) as { text?: unknown } | null
  if (typeof data?.text !== 'string' || !data.text.trim()) throw i18nError('error.unknown')
  return data.text
}
