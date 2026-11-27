import { expect, test } from '@playwright/test'
import { openNav, runDiagnosis, selectVehicleSession } from './helpers/common'

test.describe('Context, locale and theme', () => {
  test('preserves vehicle/session across views', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'M333YK47', 'S-0006')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--normal')).toBeVisible({ timeout: 30_000 })

    await openNav(page, 'Руководства')
    await openNav(page, 'Автопарк')
    await openNav(page, 'Диагностика')

    await expect(page.getByLabel('Проверка')).toHaveValue('S-0006')
    await expect(page.locator('.verdict-card--normal')).toBeVisible()
  })

  test('switches locale to Uzbek', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Русский' }).click()
    await page.getByRole('option', { name: "O'zbekcha" }).click()
    await expect(page.getByRole('button', { name: 'Diagnostika', exact: true })).toBeVisible()
    const stored = await page.evaluate(() => localStorage.getItem('judrive-locale'))
    expect(stored).toBe('uz')
  })

  test('switches locale to Hindi without Uzbek fallback', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Русский' }).click()
    await page.getByRole('option', { name: 'हिन्दी' }).click()
    await expect(page.getByRole('button', { name: 'निदान', exact: true })).toBeVisible()
    await expect(page.getByText('डिजिटल मैकेनिक', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Tekshiruvni boshlang')).toHaveCount(0)
    await expect(page.getByText('Raqamli mexanik bilan chat')).toHaveCount(0)
  })

  test('switches theme to dark', async ({ page }) => {
    await page.goto('/')
    await page.locator('html').evaluate((el) => el.setAttribute('data-theme', 'light'))
    const themeBtn = page.locator('.shell-toolbar').getByRole('button', { name: /Светлая тема|Тёмная тема|Системная тема/ })
    await themeBtn.click()
    await page.getByRole('menuitemradio', { name: 'Тёмная тема' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('switches theme to light and system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    const themeBtn = page.locator('.shell-toolbar').getByRole('button', { name: /Светлая тема|Тёмная тема|Системная тема/ })
    await themeBtn.click()
    await page.getByRole('menuitemradio', { name: 'Светлая тема' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await themeBtn.click()
    await page.getByRole('menuitemradio', { name: 'Системная тема' }).click()
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBeNull()
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(14, 14, 14)')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(244, 244, 242)')
  })
})

test.describe('Mobile shell', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('diagnosis and navigation on narrow viewport', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Диагностика' })).toBeVisible()
    await selectVehicleSession(page, 'P456AT178', 'S-0003')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--check_failed')).toBeVisible({ timeout: 30_000 })
    await openNav(page, 'Заявки')
    await openNav(page, 'Диагностика')
    await expect(page.getByLabel('Проверка')).toHaveValue('S-0003')
  })
})