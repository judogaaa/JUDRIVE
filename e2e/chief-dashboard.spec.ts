import { expect, test } from '@playwright/test'
import { chiefCredentials, loadDotEnv, openNav } from './helpers/common'

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(() => { if (!process.env.JUDRIVE_E2E_MANAGED) loadDotEnv() })

test.describe('Chief mechanic auth and filters', () => {
  test('rejects a wrong password and protects the dashboard API', async ({ page, request }) => {
    const health = await request.get('/api/health')
    expect(health.ok()).toBeTruthy()

    const user = process.env.CHIEF_USERNAME
    test.skip(!user, 'Задайте CHIEF_USERNAME для проверки формы входа')

    await page.addInitScript(() => localStorage.setItem('judrive-onboarding', JSON.stringify({ version: 1, status: 'completed', step: 6, acknowledged: true })))
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Вход главного механика' })).toBeVisible()

    await page.getByLabel('Имя').fill(user)
    await page.getByLabel('Пароль', { exact: true }).fill('wrong-password-e2e')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByText('Неверное имя или пароль')).toBeVisible()

    const unauth = await request.get('/api/fleet/dashboard')
    expect(unauth.status()).toBe(401)
  })

  test('configured password opens the dashboard and category filters', async ({ page }) => {
    const creds = chiefCredentials()
    test.skip(!creds, 'Задайте E2E_CHIEF_PASSWORD (и CHIEF_USERNAME в .env) для полного входа')

    await page.addInitScript(() => localStorage.setItem('judrive-onboarding', JSON.stringify({ version: 1, status: 'completed', step: 6, acknowledged: true })))
    await page.goto('/')
    await page.getByLabel('Имя').fill(creds.user)
    await page.getByLabel('Пароль', { exact: true }).fill(creds.password)
    await page.getByRole('button', { name: 'Войти' }).click()

    await expect(page.getByRole('heading', { name: 'Главная', exact: true })).toBeVisible()
    await openNav(page, /Главный механик/)
    await expect(page.getByRole('heading', { name: 'Главный механик' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.summary-card').first()).toBeVisible()

    await page.locator('.summary-card--warn').click()
    const categorySelect = page.locator('.chief-filters select').first()
    await expect(categorySelect).toHaveValue('attention')
    await page.locator('.chief-tabs').getByRole('button', { name: 'Транспорт' }).click()
    await expect(categorySelect).toBeVisible()
    // A chief recommendation must never be labelled as an operational quarantine.
    await expect(page.getByText('Карантин (подтверждено)')).toHaveCount(0)
  })
})
