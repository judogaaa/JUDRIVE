import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { openNav, runDiagnosis, selectVehicleSession } from './helpers/common'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('phone workflow keeps navigation and PDF controls within the viewport', async ({ page }) => {
  const expectNoPageOverflow = async () => {
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1)
  }

  await page.goto('/')
  await selectVehicleSession(page, 'B418HK98', 'S-0009')
  await runDiagnosis(page)
  const verdict = page.locator('.verdict-card--anomaly')
  const related = page.locator('.related-manuals')
  await expect(verdict).toBeVisible()
  await expect(related).toBeVisible()
  const verdictPosition = await verdict.boundingBox()
  const relatedPosition = await related.boundingBox()
  expect(verdictPosition!.y).toBeLessThan(relatedPosition!.y)
  await expectNoPageOverflow()
  const screenshots = process.env.JUDRIVE_SCREENSHOT_DIR
  if (screenshots) {
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await page.screenshot({ path: join(screenshots, 'mobile.png'), animations: 'disabled' })
  }

  await openNav(page, 'Руководства')
  await page.locator('.manual-query-field input').fill('момент затяжки крышек коренных подшипников')
  await page.getByRole('button', { name: 'Найти в РЭ/РК' }).click()
  await page.getByRole('button', { name: 'Открыть источник' }).first().click()
  const source = page.locator('.source-drawer[role="dialog"]')
  await expect(source.locator('canvas')).toBeVisible()
  await expect(source.getByRole('textbox', { name: 'Страница PDF' })).toHaveValue('68')
  await expectNoPageOverflow()
  await source.getByRole('button', { name: 'Закрыть' }).click()

  await openNav(page, 'Заявки')
  await expect(page.getByText(/^TKT-/).first()).toBeVisible()
  await expectNoPageOverflow()
  await openNav(page, 'Автопарк')
  await expect(page.locator('.fleet-table tbody tr').first()).toBeVisible()
  await expectNoPageOverflow()
  await openNav(page, 'Главный механик')
  await expect(page.locator('.summary-card').first()).toBeVisible()
  await expectNoPageOverflow()
})
