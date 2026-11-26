import { expect, test } from '@playwright/test'
import { openNav, runDiagnosis, selectVehicleSession } from './helpers/common'

test.describe('Onboarding first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('first visit shows onboarding and all steps can be traversed', async ({ page }) => {
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Добро пожаловать в JUDRIVE' })).toBeVisible()

    for (let step = 1; step < 7; step += 1) {
      await dialog.getByRole('button', { name: 'Далее' }).click()
    }
    await expect(dialog.getByRole('heading', { name: 'Готовность к работе' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Начать работу' })).toBeDisabled()
    await dialog.getByRole('checkbox', { name: 'Я ознакомился с возможностями JUDRIVE' }).check()
    await expect(dialog.getByRole('button', { name: 'Начать работу' })).toBeEnabled()
  })

  test('completion is stored and not shown again', async ({ page }) => {
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })
    for (let step = 1; step < 7; step += 1) {
      await dialog.getByRole('button', { name: 'Далее' }).click()
    }
    await dialog.getByRole('checkbox', { name: 'Я ознакомился с возможностями JUDRIVE' }).check()
    await dialog.getByRole('button', { name: 'Начать работу' }).click()
    await expect(dialog).toBeHidden()
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('judrive-onboarding') || '{}'))
    expect(state.status).toBe('completed')

    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Диагностика' })).toBeVisible()
  })

  test('skip is stored and not shown again', async ({ page }) => {
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })
    await dialog.getByRole('button', { name: 'Пропустить' }).click()
    await expect(dialog).toBeHidden()
    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })).toBeHidden()
  })

  test('unfinished step, language and theme survive reload', async ({ page }) => {
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })
    await dialog.getByRole('button', { name: 'Далее' }).click()
    await dialog.getByRole('button', { name: 'Закрыть обучение' }).click()
    await page.evaluate(() => {
      localStorage.setItem('judrive-locale', 'uz')
      localStorage.setItem('judrive-theme', 'dark')
    })
    await page.reload()
    await expect(page.locator('.onboarding')).toBeVisible()
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('judrive-onboarding') || '{}'))
    expect(state.step).toBe(1)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.onboarding__progress')).toContainText('2')
  })

  test('Escape closes onboarding, keeps progress and resumes after reload', async ({ page }) => {
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Далее' }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('judrive-onboarding') || '{}'))
    expect(state.status).toBe('in_progress')
    expect(state.step).toBe(1)

    await page.reload()
    await expect(page.locator('.onboarding')).toBeVisible()
    await expect(page.locator('.onboarding__progress')).toContainText('2')
  })

  test('respects reduced motion preferences', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const panel = page.locator('.onboarding__panel')
    await expect(panel).toBeVisible()
    const duration = await panel.evaluate((node) => getComputedStyle(node).animationDuration)
    expect(Number.parseFloat(duration)).toBeLessThan(0.1)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('mobile onboarding has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test.describe('Help center and onboarding restart', () => {
  test('search, cards and navigation work', async ({ page }) => {
    await page.goto('/')
    await openNav(page, /Помощь и обучение/)
    await expect(page.getByRole('heading', { name: 'Помощь и обучение' })).toBeVisible()
    await expect(page.locator('.help-card')).toHaveCount(12)

    const search = page.getByPlaceholder('Найти инструкцию…')
    await search.fill('PDF')
    const pdfCard = page.locator('.help-card').filter({ hasText: 'Как работать с PDF' })
    await expect(pdfCard).toHaveCount(1)
    await pdfCard.locator('summary').click()
    await pdfCard.getByRole('button', { name: 'Перейти' }).click()
    await expect(page.getByRole('heading', { name: 'Руководства' })).toBeVisible()
  })

  test('restart reopens onboarding and skipping keeps diagnosis context', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'B418HK98', 'S-0009')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible({ timeout: 30_000 })

    await openNav(page, /Помощь и обучение/)
    await page.getByRole('button', { name: 'Пройти обучение заново' }).click()
    const dialog = page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Пропустить' }).click()
    await openNav(page, 'Диагностика')
    await expect(page.getByLabel('Проверка')).toHaveValue('S-0009')
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible()
  })

  test('chief still requires authentication after help', async ({ page }) => {
    await page.goto('/')
    await openNav(page, /Помощь и обучение/)
    await openNav(page, /Главный механик/)
    await expect(page.getByRole('heading', { name: 'Вход главного механика' })).toBeVisible()
  })
})

test.describe('Onboarding accessibility edge cases', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test('invalid persisted step recovers and background is inert', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('judrive-onboarding', JSON.stringify({ version: 1, status: 'in_progress', step: 1.5 })))
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Знакомство с JUDRIVE' })
    await expect(dialog.getByRole('heading', { name: 'Добро пожаловать в JUDRIVE' })).toBeVisible()
    await expect(page.locator('.shell')).toHaveAttribute('inert', '')
    for (let i = 0; i < 6; i++) await dialog.getByRole('button', { name: 'Далее' }).click()
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBeTruthy()
    await page.keyboard.press('Escape')
    await expect(page.locator('.shell')).not.toHaveAttribute('inert', '')
  })
})
