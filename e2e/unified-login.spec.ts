import { expect, test } from '@playwright/test'
import { openNav, runDiagnosis, selectVehicleSession } from './helpers/common'

test.use({ storageState: { cookies: [], origins: [] } })

for (const width of [1440, 390]) {
  test(`standalone demo login and dashboard at ${width}px`, async ({ page }, testInfo) => {
    await page.context().clearCookies()
    await page.setViewportSize({ width, height: 900 })
    const consoleErrors: string[] = []
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto('/')
    await expect(page.getByRole('note')).toContainText('Имя: 123 · Пароль: 123')
    await expect(page.locator('.shell')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(await noOverflow()).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath('login.png') })
    await page.getByLabel('Имя').fill('123')
    await page.getByLabel('Пароль', { exact: true }).fill('123')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByRole('button', { name: 'Пропустить' })).toBeVisible()
    await page.getByRole('button', { name: 'Пропустить' }).click()
    await expect(page.getByRole('heading', { name: 'Главная', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Последние проверки' })).toBeVisible()
    await expect(page.locator('.workspace-dashboard__stats')).toContainText('50')
    const titleHeight = await page.locator('.shell-brand__title').evaluate((node) => ({
      rendered: node.getBoundingClientRect().height,
      line: Number.parseFloat(getComputedStyle(node).lineHeight),
    }))
    expect(titleHeight.rendered).toBeLessThanOrEqual(titleHeight.line + 1)
    expect((await page.locator('.shell-toolbar').boundingBox())!.height).toBeLessThanOrEqual(42)
    await page.screenshot({ path: testInfo.outputPath('dashboard.png') })
    expect(await noOverflow()).toBeLessThanOrEqual(1)

    await selectVehicleSession(page, 'B418HK98', 'S-0009')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible()
    await expect(page.locator('.voice-box')).toHaveCount(0)
    await openNav(page, 'Автопарк')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Главная', exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await openNav(page, /Помощь и обучение/)
    await page.getByRole('button', { name: 'Пройти обучение заново' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Пропустить' }).click()
    await page.getByRole('button', { name: 'Выйти' }).click()
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
    expect(consoleErrors).toEqual([])
  })
}

test('restricted production demo has a usable screen and onboarding on each login', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('judrive-test-seeded-onboarding')) {
      localStorage.setItem('judrive-test-seeded-onboarding', '1')
      localStorage.setItem('judrive-onboarding', JSON.stringify({ version: 1, status: 'completed', step: 6, acknowledged: true }))
    }
  })
  await page.route('**/api/vehicles', route => route.fulfill({
    status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'Недоступно в деморежиме' }),
  }))
  const signIn = async () => {
    await page.getByLabel('Имя').fill('123')
    await page.getByLabel('Пароль', { exact: true }).fill('123')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })).toBeVisible()
    await page.getByRole('button', { name: 'Пропустить' }).click()
  }

  await page.goto('/')
  await signIn()
  const unavailable = page.getByText('Данные автопарка и диагностика недоступны в публичном демо.', { exact: false })
  await expect(unavailable).toBeVisible()
  await expect(page.locator('.panel__error')).toHaveCount(0)
  await expect(page.locator('.workspace-dashboard__stats')).toHaveCount(0)
  for (const section of ['Диагностика', 'Автопарк']) {
    await openNav(page, section)
    await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible()
    await expect(unavailable).toBeVisible()
    await expect(page.locator('.panel__error')).toHaveCount(0)
  }
  await page.reload()
  await expect(unavailable).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Пройти обучение заново' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Пропустить' }).click()
  await page.locator('.shell-toolbar').getByRole('button', { name: 'Выйти' }).click()
  await signIn()
  await expect(unavailable).toBeVisible()
})

test('unexpected fleet failure still offers retry', async ({ page }) => {
  await page.route('**/api/vehicles', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Сервис временно недоступен' }),
  }))
  await page.goto('/')
  await page.getByLabel('Имя').fill('123')
  await page.getByLabel('Пароль', { exact: true }).fill('123')
  await page.getByRole('button', { name: 'Войти' }).click()
  await page.getByRole('button', { name: 'Пропустить' }).click()
  await expect(page.getByRole('alert')).toContainText('Сервис временно недоступен')
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible()
})

test('private invitation is submitted only with the demo pair and removed from the URL', async ({ page }) => {
  const secret = 'test-private-invitation-000000000000000000000000'
  let received: unknown
  await page.route('**/api/auth/login', async route => {
    received = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, role: 'chief' }) })
  })
  await page.goto('/#jury=' + secret)
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
  expect(new URL(page.url()).hash).toBe('')
  await page.getByLabel('Имя').fill('123')
  await page.getByLabel('Пароль', { exact: true }).fill('123')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })).toBeVisible()
  expect(received).toEqual({ username: '123', password: '123', jury_token: secret })
  await page.getByRole('button', { name: 'Пропустить' }).click()
  await expect(page.locator('.shell-nav').getByRole('button', { name: 'Руководства' })).toBeVisible()
  await expect(page.locator('.shell-nav').getByRole('button', { name: 'Заявки' })).toBeVisible()
})

test('an invitation opened in an existing demo tab offers full-access login', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Имя').fill('123')
  await page.getByLabel('Пароль', { exact: true }).fill('123')
  await page.getByRole('button', { name: 'Войти' }).click()
  await page.getByRole('button', { name: 'Пропустить' }).click()
  await expect(page.locator('.shell')).toBeVisible()
  await page.evaluate(() => { location.hash = 'jury=private-test-invitation-000000000000000000000000' })
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
  await expect(page.locator('.shell')).toHaveCount(0)
  expect(new URL(page.url()).hash).toBe('')
})
