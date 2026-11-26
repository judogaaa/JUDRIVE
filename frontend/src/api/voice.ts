import type { LocaleCode } from '../i18n/translations'

export async function transcribeAudio(blob: Blob, locale: LocaleCode): Promise<string> {
  const form = new FormData()
  form.append('file', blob, 'speech.webm')
  form.append('locale', locale)
  const response = await fetch('/api/voice/transcribe', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    let detail = `Ошибка STT (${response.status})`
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  const data = (await response.json()) as { text: string }
  return data.text
}