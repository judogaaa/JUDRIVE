import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('reviewed voice command launches diagnosis in all seven languages, questions do not', async ({ page }) => {
  page.setDefaultTimeout(10_000)
  let transcript = ''
  let diagnoses = 0
  await page.addInitScript(`(() => {
    // Test the real UI flow after STT, without recording a real microphone.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    })
    class TestRecorder {
      static isTypeSupported() { return true }
      state = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable = null
      onstop = null
      start() { this.state = 'recording' }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['synthetic audio'], { type: this.mimeType }) })
        this.onstop?.()
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: TestRecorder })
  })()`)
  await page.route('**/api/voice/transcribe', route => route.fulfill({ json: { text: transcript } }))
  await page.route('**/api/diagnose', route => {
    diagnoses++
    return route.continue()
  })
  for (const locale of ['ru', 'uz', 'kk', 'tg', 'ky', 'hi', 'bn']) {
    const labels = JSON.parse(readFileSync(join(__dirname, '..', 'frontend', 'src', 'i18n', 'locales', locale + '.json'), 'utf8'))
    await page.goto('/')
    await page.evaluate(code => localStorage.setItem('judrive-locale', code), locale)
    await page.reload()
    await page.locator('.shell-nav, .shell-nav-mobile').getByRole('button', { name: labels['nav.diagnosis'], exact: true }).click()
    if (locale === 'bn') await page.setViewportSize({ width: 390, height: 844 })
    const voice = page.locator('.voice-box')
    await expect.poll(() => page.evaluate(() => typeof navigator.mediaDevices?.getUserMedia)).toBe('function')
    const compose = page.locator('.chat-compose__bar > textarea')
    transcript = labels['voice.diagnosePhrase'] + '!'
    await voice.getByRole('button', { name: labels['voice.record'], exact: true }).click()
    await voice.getByRole('button', { name: labels['voice.stop'], exact: true }).click()
    await expect(voice.locator('textarea')).toBeVisible()
    await expect(voice.locator('textarea')).toHaveValue(transcript)
    const before = diagnoses
    await voice.getByRole('button', { name: labels['chat.send'], exact: true }).click()
    await expect.poll(() => diagnoses).toBe(before + 1)
    await expect(page.locator('.chat-diagnosis-result')).toHaveCount(1)
    await expect(compose).toHaveValue('')
    transcript = labels['voice.diagnosePhrase'] + ' — ?'
    await voice.getByRole('button', { name: labels['voice.record'], exact: true }).click()
    await voice.getByRole('button', { name: labels['voice.stop'], exact: true }).click()
    await expect(voice.locator('textarea')).toBeVisible()
    await expect(voice.locator('textarea')).toHaveValue(transcript)
    await voice.getByRole('button', { name: labels['chat.send'], exact: true }).click()
    await expect(compose).toHaveValue(transcript)
    expect(diagnoses).toBe(before + 1)
  }
})

test('authenticated voice upload reaches GigaChat attachment contract', async ({ request }) => {
  const wav = Buffer.alloc(44 + 1600)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24)
  wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(1600, 40)
  const result = await request.post('/api/voice/transcribe', {
    multipart: { locale: 'ru', file: { name: 'voice.wav', mimeType: 'audio/wav', buffer: wav } },
  })
  expect(result.status()).toBe(200)
  await expect(result.json()).resolves.toEqual({ text: 'Проверьте клапанный механизм.', language: 'ru' })
})
