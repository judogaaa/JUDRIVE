import { expect, test } from '@playwright/test'
import { runDiagnosis, selectVehicleSession } from './helpers/common'

test.describe('Targeted regressions after 02f96dd', () => {
  test('history chart never shows the previous vehicle while a new series is loading', async ({ page }) => {
    await page.route('**/api/vehicles/*/diagnosis-history', async (route) => {
      const delay = route.request().url().includes('M333YK47') ? 1400 : 250
      await new Promise((resolve) => setTimeout(resolve, delay))
      await route.continue()
    })

    await page.goto('/')
    await selectVehicleSession(page, 'B418HK98', 'S-0009')
    await page.getByRole('tab', { name: 'Динамика' }).click()
    await expect
      .poll(async () => (await page.locator('.diag-history svg title').allTextContents()).join(' '))
      .toContain('S-0009')

    await page.locator('.vehicle-picker__trigger').click()
    await page.getByRole('combobox', { name: 'Поиск' }).fill('M333YK47')
    await page.getByRole('listbox').getByRole('option', { name: /M333YK47/ }).click()
    await expect(page.getByLabel('Проверка')).toHaveValue('S-0006')

    // The old series must disappear immediately, not after the delayed M333 request settles.
    await expect
      .poll(async () => (await page.locator('.diag-history svg title').allTextContents()).join(' '))
      .not.toContain('S-0009')
    await expect
      .poll(async () => (await page.locator('.diag-history svg title').allTextContents()).join(' '), {
        timeout: 10_000,
      })
      .toMatch(/S-000[456]/)
    const titles = (await page.locator('.diag-history svg title').allTextContents()).join(' ')
    expect(titles).not.toMatch(/S-000[789]/)
  })

  test('confirmed ticket sources open the exact PDF page in the embedded viewer', async ({ page }) => {
    await page.route('**/api/conversations/*/messages', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: 'Черновик заявки подготовлен по подтверждённому источнику.',
          sources: [],
          tool_trace: [],
          draft: {
            draft_id: 'draft-regression-source',
            confirm_nonce: 'nonce-regression-source',
            version: 1,
            status: 'draft',
            payload: {
              vehicle_id: 'B418HK98',
              session_id: 'S-0009',
              anomaly_type: 'F01',
              conclusion: 'Возможное отклонение клапанного механизма, требуется проверка.',
              urgency: 'medium',
              operations: ['Проверить тепловые зазоры клапанного механизма по руководству'],
              spare_parts: [],
              references: [{ manual: '236-3902150-Б РЭ', pdf_page: 34 }],
            },
          },
        }),
      }),
    )

    await page.goto('/')
    await selectVehicleSession(page, 'B418HK98', 'S-0009')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible({ timeout: 30_000 })
    await page.locator('.verdict-actions').getByRole('button', { name: 'Подготовить заявку' }).click()

    const draft = page.locator('.ticket-draft')
    await expect(draft.getByRole('heading', { name: 'Черновик заявки ТОиР' })).toBeVisible({ timeout: 30_000 })
    await draft.getByRole('button', { name: /236-3902150.*34/ }).click()

    const viewer = page.getByRole('dialog', { name: /236-3902150/ })
    await expect(viewer).toBeVisible()
    await expect(viewer.getByRole('textbox', { name: 'Страница PDF' })).toHaveValue('34')
    await expect(viewer.locator('canvas')).toBeVisible({ timeout: 45_000 })
  })

  test('double press during an unfinished diagnosis sends one request', async ({ page }) => {
    let calls = 0
    await page.route('**/api/diagnose', async (route) => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 900))
      await route.continue()
    })

    await page.goto('/')
    await selectVehicleSession(page, 'M333YK47', 'S-0006')
    const run = page.locator('.diag-run__button')
    const box = await run.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2)

    await expect(run).toBeDisabled()
    await expect(page.locator('.verdict-card--normal')).toBeVisible({ timeout: 30_000 })
    expect(calls).toBe(1)

    await expect(run).toBeEnabled()
    await run.click()
    await expect(page.locator('.verdict-card--normal')).toBeVisible({ timeout: 30_000 })
    expect(calls).toBe(2)
    await expect(run).toBeEnabled({ timeout: 30_000 })
  })
})
