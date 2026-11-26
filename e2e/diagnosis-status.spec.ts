import { expect, test } from '@playwright/test'
import { runDiagnosis, selectVehicleSession } from './helpers/common'

type Scenario = {
  name: string
  vehicleId: string
  sessionId: string
  statusClass: 'verdict-card--normal' | 'verdict-card--anomaly' | 'verdict-card--check_failed'
    actionName?: RegExp
}

const SCENARIOS: Scenario[] = [
  {
    name: 'normal',
    vehicleId: 'M333YK47',
    sessionId: 'S-0006',
    statusClass: 'verdict-card--normal',
    actionName: /Найти в руководстве/,
  },
  {
    name: 'anomaly',
    vehicleId: 'B418HK98',
    sessionId: 'S-0009',
    statusClass: 'verdict-card--anomaly',
    actionName: /Подготовить заявку/,
  },
  {
    name: 'check_failed',
    vehicleId: 'P456AT178',
    sessionId: 'S-0003',
    statusClass: 'verdict-card--check_failed',
    actionName: /другую проверку/i,
  },
]

test.describe('Diagnosis acceptance scenarios', () => {
  for (const scenario of SCENARIOS) {
    test(scenario.name, async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Диагностика' })).toBeVisible()
      await selectVehicleSession(page, scenario.vehicleId, scenario.sessionId)
      await runDiagnosis(page)
      const card = page.locator(`.${scenario.statusClass}`)
      await expect(card).toBeVisible({ timeout: 30_000 })
      if (scenario.actionName) {
        await expect(page.getByRole('button', { name: scenario.actionName }).first()).toBeVisible()
      }
    })
  }

  test('manual navigation from verdict', async ({ page }) => {
    await page.goto('/')
    await selectVehicleSession(page, 'M333YK47', 'S-0006')
    await page.getByRole('button', { name: /Получить результат диагностики/ }).click()
    await expect(page.locator('.verdict-card--normal')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Найти в руководстве' }).click()
    await expect(page.getByRole('button', { name: 'Диагностика' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Руководства' })).toBeVisible()
    const searchInput = page.locator('.manual-query-field input')
    await expect(searchInput).not.toHaveValue('')
  })
})