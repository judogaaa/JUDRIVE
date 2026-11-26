import { expect, test } from '@playwright/test'
import { loadDotEnv, openNav, runDiagnosis, selectVehicleSession } from './helpers/common'

test.beforeAll(() => loadDotEnv())

test.describe('Diagnosis → manual → PDF → chat', () => {
  test('anomaly context through sources', async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await selectVehicleSession(page, 'B418HK98', 'S-0009')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible({ timeout: 30_000 })

    const nextStep = page.locator('.verdict-actions__primary')
    await expect(nextStep).toHaveText('Найти в руководстве')
    await expect(nextStep).toBeInViewport({ ratio: 1 })
    await nextStep.click()
    await expect(page.getByRole('button', { name: 'Диагностика' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Поиск по руководству' })).toBeVisible()

    await page.getByRole('button', { name: 'Найти в РЭ/РК' }).click()
    await expect(page.locator('.manual-results li').first()).toBeVisible({ timeout: 20_000 })

    const firstPage = page.locator('.manual-result__page').first()
    await expect(firstPage).toContainText(/PDF \d+/)

    await page.getByRole('button', { name: 'Открыть источник' }).first().click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    const pageField = dialog.getByRole('textbox', { name: 'Страница PDF' })
    await expect(pageField).toBeVisible()
    await expect(dialog.locator('canvas')).toBeVisible({ timeout: 45_000 })
    await expect(pageField).toHaveValue(/\d+/)
    const citationPage = await pageField.inputValue()
    await dialog.getByRole('button', { name: 'По ширине' }).click()
    await dialog.getByRole('button', { name: 'На весь экран' }).click()
    await expect(dialog).toHaveClass(/source-drawer--full/)
    await dialog.getByRole('button', { name: 'Следующая страница' }).click()
    await expect(pageField).not.toHaveValue(citationPage)
    await dialog.getByRole('button', { name: new RegExp(`Физическая страница PDF: ${citationPage}`) }).click()
    await expect(pageField).toHaveValue(citationPage)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: 'В чат' }).first().click()
    await openNav(page, 'Диагностика')
    await expect(page.getByPlaceholder('Вопрос или команда механика…')).not.toHaveValue('')
  })

  test('manual refuses nonsense query', async ({ page, request }) => {
    const api = await request.post('/api/manuals/search', {
      data: { engine_model: 'ЯМЗ-236М2', query: 'квантовый дилатометр картерных стенок', limit: 3 },
    })
    expect(api.ok()).toBeTruthy()
    const body = await api.json()
    expect(body.status).toBe('not_found')

    await page.goto('/')
    await selectVehicleSession(page, 'M333YK47', 'S-0006')
    await openNav(page, 'Руководства')
    await page.locator('.manual-query-field input').fill('квантовый дилатометр картерных стенок')
    await page.getByRole('button', { name: 'Найти в РЭ/РК' }).click()
    await expect(page.locator('.manual-refusal')).toBeVisible({ timeout: 15_000 })
  })

  test('API returns page 68 for rod bearing torque (ЯМЗ-236)', async ({ request }) => {
    const response = await request.post('/api/manuals/search', {
      data: {
        engine_model: 'ЯМЗ-236М2',
        query: 'момент затяжки крышек коренных подшипников',
        limit: 8,
      },
    })
    expect(response.ok()).toBeTruthy()
    const payload = await response.json()
    expect(payload.status).toBe('ok')
    const pages: number[] = (payload.results ?? []).map((r: { pdf_page: number }) => r.pdf_page)
    expect(pages).toContain(68)
  })
})