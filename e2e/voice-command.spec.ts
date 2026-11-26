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
