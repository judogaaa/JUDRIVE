import type { LocaleCode } from '../i18n/translations'
import { i18nError } from '../lib/i18nError'

export async function transcribeAudio(blob: Blob, locale: LocaleCode): Promise<string> {
  const form = new FormData()
  form.append('file', blob, 'speech.webm')
  form.append('locale', locale)
  const response = await fetch('/api/voice/transcribe', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) throw new Error(body.detail)
    } catch (err) {
      if (err instanceof Error && err.message && !err.message.includes('JSON')) {
        throw err
      }
    }
    throw i18nError('error.stt', response.status)
  }
  const data = (await response.json()) as { text: string }
  return data.text
}