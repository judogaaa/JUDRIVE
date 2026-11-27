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
