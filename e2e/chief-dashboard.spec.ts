import { expect, test } from '@playwright/test'
import { chiefCredentials, loadDotEnv, openNav } from './helpers/common'

test.beforeAll(() => loadDotEnv())

test.describe('Chief mechanic auth and filters', () => {
  test('login form rejects wrong password when chief configured', async ({ page, request }) => {
    const health = await request.get('/api/health')
    expect(health.ok()).toBeTruthy()

    await page.goto('/')
    await openNav(page, /Главный механик/)

    const creds = chiefCredentials()
    test.skip(!creds, 'Задайте E2E_CHIEF_PASSWORD (и CHIEF_USERNAME в .env) для полного входа')

    await page.getByLabel('Имя').fill(creds.user)
    await page.getByLabel('Пароль', { exact: true }).fill('wrong-password-e2e')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByText('Неверное имя или пароль')).toBeVisible()

    await page.getByLabel('Пароль', { exact: true }).fill(creds.password)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByRole('heading', { name: 'Главный механик' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.summary-card').first()).toBeVisible()

    await page.getByRole('button', { name: 'Требует внимания' }).click()
    const categorySelect = page.locator('select').filter({ has: page.locator('option', { name: 'Требует внимания' }) })
    await expect(categorySelect).toHaveValue('attention')
    await page.getByRole('button', { name: 'Транспорт' }).click()
    await expect(categorySelect).toBeVisible()

    const unauth = await request.get('/api/fleet/dashboard')
    expect(unauth.status()).toBe(401)
  })
})