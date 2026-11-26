import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { loadDotEnv, openNav, runDiagnosis, selectVehicleSession } from './helpers/common'

test.beforeAll(() => loadDotEnv())

test.describe('Final UX audit — diagnosis workspace', () => {
  test('vehicle picker opens all 50 without a query, searches layouts and clears', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.vehicle-picker__trigger')).toBeVisible()

    await page.locator('.vehicle-picker__trigger').click()
    const list = page.getByRole('listbox', { name: 'Машина' })
    await expect(list).toBeVisible()
    await expect(list.getByRole('option')).toHaveCount(50)
    await expect(page.getByText('Показано 50 из 50')).toBeVisible()

    const combo = page.getByRole('combobox', { name: 'Поиск' })
    await combo.fill('MAZ') // Latin layout for МАЗ
    await expect(list.getByRole('option').first()).toBeVisible()
    await expect(list.getByRole('option', { name: /P456AT178/ })).toBeVisible()

    await combo.fill('в418нк98') // Cyrillic layout for B418HK98
    await expect(list.getByRole('option', { name: /B418HK98/ })).toBeVisible()

    await page.getByRole('button', { name: 'Очистить поиск' }).click()
    await expect(combo).toHaveValue('')
    await expect(list.getByRole('option')).toHaveCount(50)

    await combo.fill('нет-такой-машины')
    await expect(list.getByRole('option')).toHaveCount(0)
    await expect(list.getByText(/Ничего не найдено/)).toBeVisible()

    await combo.fill('M333YK47')
    await list.getByRole('option', { name: /M333YK47/ }).click()
    await expect(page.locator('.vehicle-picker__trigger')).toContainText('M333YK47')
    await expect(page.getByLabel('Проверка')).toHaveValue('S-0006')
  })

  test('vehicle picker supports keyboard-only selection', async ({ page }) => {
    await page.goto('/')
    const trigger = page.locator('.vehicle-picker__trigger')
    await expect(trigger).toContainText('P456AT178')
    await trigger.focus()
    await page.keyboard.press('Enter')
    const combo = page.getByRole('combobox', { name: 'Поиск' })
    await expect(combo).toBeFocused()
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(50)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(trigger).toContainText('M333YK47')
  })

  test('all sessions of the selected vehicle are selectable', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'P456AT178', 'S-0003')
    const select = page.getByLabel('Проверка')
    const values = await select.locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    )
    expect(values).toEqual(['S-0003', 'S-0002', 'S-0001'])
    await select.selectOption('S-0001')
    await expect(select).toHaveValue('S-0001')
  })

  test('switching vehicle during an in-flight diagnosis drops the stale verdict', async ({ page }) => {
    await page.route('**/api/diagnose', async (route) => {
      const body = route.request().postDataJSON() as { vehicle_id?: string }
      if (body.vehicle_id === 'B418HK98') {
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
      await route.continue()
    })

    await page.goto('/')
    await selectVehicleSession(page, 'B418HK98', 'S-0009')
    await runDiagnosis(page)

    await page.locator('.vehicle-picker__trigger').click()
    await page.getByRole('combobox', { name: 'Поиск' }).fill('M333YK47')
    await page.getByRole('listbox').getByRole('option', { name: /M333YK47/ }).click()
    await expect(page.getByLabel('Проверка')).toHaveValue('S-0006')

    await page.waitForTimeout(2000)
    await expect(page.locator('.verdict-card--anomaly')).toHaveCount(0)
    await expect(page.locator('.verdict-card--empty')).toBeVisible()
    await expect(page.locator('.chat-panel')).toContainText('Сначала получите результат диагностики')

    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--normal')).toBeVisible({ timeout: 30_000 })
  })

  test('language switch keeps the selected vehicle and does not rerun the first car', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'B418HK98', 'S-0009')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Русский' }).click()
    await page.getByRole('option', { name: "O'zbekcha" }).click()
    await expect(page.getByRole('button', { name: 'Diagnostika', exact: true })).toBeVisible()

    await expect(page.locator('.vehicle-picker__trigger')).toContainText('B418HK98')
    await expect(page.locator('.diag-session-field select')).toHaveValue('S-0009')
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible()
  })

  test('failed recording offers a real session chooser and no ticket or fake metrics', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'P456AT178', 'S-0003')
    await runDiagnosis(page)
    const card = page.locator('.verdict-card--check_failed')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card).toContainText('перегрузка микрофона')
    await expect(card.locator('.verdict-card__meta')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Подготовить заявку' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Выбрать другую проверку' }).click()
    const dialog = page.getByRole('dialog', { name: /Выберите другую проверку/ })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: /S-0002/ })).toBeVisible()
    await dialog.getByRole('button', { name: /S-0002/ }).click()
    await expect(page.getByLabel('Проверка')).toHaveValue('S-0002')
    await expect(page.locator('.verdict-card--empty')).toBeVisible()
  })

  test('warning quality is shown honestly and is not treated as low risk', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'C991PH47', 'S-0148')
    await runDiagnosis(page)
    const card = page.locator('.verdict-card--anomaly')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('.verdict-card__quality')).toContainText('Запись с помехами')
    await expect(card).toContainText('0.56')
    await expect(card).toContainText('F12')
  })

  test('chat keeps the typed text when Groq is unavailable and retries', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'M333YK47', 'S-0006')
    const input = page.getByPlaceholder('Вопрос или команда механика…')
    await expect(input).toBeEnabled({ timeout: 30_000 })

    await page.route('**/api/conversations/*/messages', (route) => route.abort('failed'))
    await input.fill('Проверь запись и источники')
    await page.getByRole('button', { name: 'Отправить' }).click()

    await expect(page.locator('.chat-error')).toBeVisible({ timeout: 20_000 })
    await expect(input).toHaveValue('Проверь запись и источники')
    await expect(page.getByRole('button', { name: 'Повторить отправку' })).toBeVisible()

    await page.unroute('**/api/conversations/*/messages')
    await page.route('**/api/conversations/*/messages', (route) =>
      route.fulfill({
        json: {
          reply: '**Вывод:**\n- проверить зазоры\n1. открыть руководство\n\nИсточник подтверждён.',
          tool_trace: [],
          sources: [],
          draft: null,
          usage: {},
        },
      }),
    )
    await page.getByRole('button', { name: 'Повторить отправку' }).click()
    await expect(page.locator('.chat-bubble--user').filter({ hasText: 'Проверь запись и источники' })).toBeVisible()
    const answer = page.locator('.chat-bubble--assistant').last().locator('.chat-bubble__text')
    await expect(answer.locator('strong')).toHaveText('Вывод:')
    await expect(answer.locator('ul li')).toHaveText('проверить зазоры')
    await expect(answer.locator('ol li')).toHaveText('открыть руководство')
    await expect(answer).not.toContainText('**')
  })

  test('P854BT78 rejects an incompatible F14 result without replacing its code', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'P854BT78', 'S-0021')
    await runDiagnosis(page)
    const verdict = page.locator('.verdict-card--check_failed')
    await expect(verdict).toBeVisible({ timeout: 30_000 })
    await expect(verdict).toContainText('F14')
    await expect(verdict).toContainText('ЯМЗ-236М2')
    await expect(verdict.getByRole('button', { name: 'Подготовить заявку' })).toHaveCount(0)
    await expect(verdict.locator('.verdict-card__meta')).toHaveCount(0)
  })

  test('repeated diagnosis refreshes the same pair and blocks double submit', async ({ page }) => {
    let calls = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/diagnose')) calls += 1
    })
    await page.goto('/')
    await selectVehicleSession(page, 'M333YK47', 'S-0006')
    const run = page.getByRole('button', { name: /Получить результат диагностики/ })
    await run.click()
    await expect(page.locator('.verdict-card--normal')).toBeVisible({ timeout: 30_000 })
    await expect(run).toBeEnabled()
    await run.click()
    await expect(page.locator('.verdict-card--normal')).toBeVisible({ timeout: 30_000 })
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  test('fleet load failure is localized and retryable', async ({ page }) => {
    let fail = true
    await page.route('**/api/vehicles', (route) => (fail ? route.abort('failed') : route.continue()))
    await page.goto('/')
    const error = page.locator('.panel__error').first()
    await expect(error).toContainText('Нет связи с сервером')
    await expect(error).not.toContainText('@i18n')

    fail = false
    await error.getByRole('button', { name: 'Повторить' }).click()
    await expect(page.locator('.vehicle-picker__trigger')).toContainText('P456AT178', { timeout: 20_000 })
  })

  test('diagnosis HTTP 503 is localized and retry works', async ({ page }) => {
    await page.route('**/api/diagnose', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Mock ML временно недоступен' }),
      }),
    )
    await page.goto('/')
    await selectVehicleSession(page, 'M333YK47', 'S-0006')
    await runDiagnosis(page)
    const card = page.locator('.verdict-card--error')
    await expect(card).toContainText('Mock ML временно недоступен', { timeout: 20_000 })
    await expect(card).not.toContainText('@i18n')

    await page.unroute('**/api/diagnose')
    await card.getByRole('button', { name: 'Повторить' }).click()
    await expect(page.locator('.verdict-card--normal')).toBeVisible({ timeout: 30_000 })
  })

  test('related manual sources open the cited PDF page', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'B418HK98', 'S-0009')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible({ timeout: 30_000 })

    const related = page.locator('.related-manuals')
    await expect(related.locator('.history-item').first()).toBeVisible({ timeout: 20_000 })
    await related.locator('.history-item').first().click()
    const viewer = page.getByRole('dialog')
    await expect(viewer.locator('canvas')).toBeVisible({ timeout: 45_000 })
    await expect(viewer.getByRole('textbox', { name: 'Страница PDF' })).not.toHaveValue('')
  })

  test('viewport sweep has no horizontal overflow in diagnosis', async ({ page }) => {
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.getByLabel('Проверка').waitFor()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `overflow at ${viewport.width}px`).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('Final UX audit — fleet, tickets and chief', () => {
  test('fleet status filter exposes latest check state and resets cleanly', async ({ page }) => {
    await page.goto('/')
    await openNav(page, 'Автопарк')
    const status = page.getByLabel('Статус')
    await expect(status).toBeVisible()
    await status.selectOption('failed')
    await expect(page.locator('.fleet-table tbody tr').first()).toBeVisible()
    await expect(page.locator('.fleet-table tbody tr .badge').first()).toHaveText('Запись непригодна')
    const rows = page.locator('.fleet-table tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
    for (let index = 0; index < count; index += 1) {
      expect(await rows.nth(index).locator('.badge').first().textContent()).toContain('Запись непригодна')
    }
    await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
    await expect(page.locator('.toolbar-meta')).toContainText('Показано 50 из 50')
  })

  test('fleet card opens diagnosis and tickets with the same vehicle', async ({ page }) => {
    await page.goto('/')
    await openNav(page, 'Автопарк')
    await page.locator('.fleet-table tbody tr').filter({ hasText: 'B418HK98' }).click()
    const drawer = page.getByRole('dialog', { name: /B418HK98/ })
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: /S-0009/ }).click()
    await expect(page.locator('.vehicle-picker__trigger')).toContainText('B418HK98')
    await expect(page.getByLabel('Проверка')).toHaveValue('S-0009')

    await openNav(page, 'Заявки')
    await expect(page.locator('.ticket-row').first()).toBeVisible()
  })

  test('ticket detail keeps the vehicle filter and opens source context', async ({ page }) => {
    await page.goto('/')
    await openNav(page, 'Автопарк')
    await page.locator('.fleet-table tbody tr').filter({ hasText: 'B418HK98' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Заявки' }).click()
    await expect(page.locator('.filter-chip')).toContainText('B418HK98')

    const row = page.locator('.ticket-row').first()
    await expect(row).toBeVisible()
    await row.locator('.ticket-row__head').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeVisible()
    await expect(dialog.getByText('F01', { exact: true })).toBeVisible()
    const source = dialog.getByRole('button', { name: /236-3902150/ }).first()
    await expect(source).toBeVisible()
    await source.click()
    await expect(page.getByRole('dialog', { name: /236-3902150/ })).toBeVisible()
  })

  test('ticket detail opens the original diagnosis pair', async ({ page }) => {
    await page.goto('/')
    await openNav(page, 'Заявки')
    const row = page
      .locator('.ticket-row')
      .filter({ hasText: /B418HK98/ })
      .filter({ hasText: /S-0009/ })
      .first()
    await expect(row).toBeVisible()
    await row.locator('.ticket-row__head').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /B418HK98/ }).click()
    await expect(page.locator('.vehicle-picker__trigger')).toContainText('B418HK98')
    await expect(page.getByLabel('Проверка')).toHaveValue('S-0009')
    await expect(page.locator('.verdict-card--empty')).toBeVisible()
  })

  test('chief dashboard works with a signed server session and paginates the fleet', async ({ page, context, baseURL }) => {
    const secret = process.env.SESSION_SECRET
    test.skip(!secret, 'SESSION_SECRET is required for signed-session check')
    const exp = Math.floor(Date.now() / 1000) + 3600
    const payload = `chief:${exp}`
    const signature = createHmac('sha256', secret).update(payload).digest('hex')
    await context.addCookies([
      {
        name: 'judrive_chief',
        value: `${payload}.${signature}`,
        url: baseURL ?? 'http://127.0.0.1:5173',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])

    await page.goto('/')
    await openNav(page, /Главный механик/)
    await expect(page.getByRole('heading', { name: 'Главный механик' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.summary-card')).toHaveCount(3)

    await page.locator('.summary-card--warn').click()
    const category = page.locator('.chief-filters select').first()
    await expect(category).toHaveValue('attention')

    await page.getByRole('button', { name: 'Предупреждения' }).click()
    await expect(page.getByRole('heading', { name: 'Ранние предупреждения' })).toBeVisible()

    await page.getByRole('button', { name: 'Транспорт' }).click()
    await expect(page.locator('.pagination')).toBeVisible()
    await page.locator('.fleet-table tbody tr').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Открыть в диагностике' })).toBeVisible()
  })
})
