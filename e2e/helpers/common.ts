import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

const REPO_ROOT = join(__dirname, '..', '..')

export function loadDotEnv(): void {
  const path = join(REPO_ROOT, '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

export const API_BASE = process.env.E2E_API_BASE ?? 'http://127.0.0.1:8090'

export function chiefCredentials(): { user: string; password: string } | null {
  const user = process.env.E2E_CHIEF_USER ?? process.env.CHIEF_USERNAME ?? ''
  const password = process.env.E2E_CHIEF_PASSWORD ?? ''
  if (!user || !password) return null
  return { user, password }
}

export async function selectVehicleSession(page: Page, vehicleId: string, sessionId: string) {
  await page.locator('.vehicle-picker__trigger').click()
  const combo = page.getByRole('combobox', { name: 'Поиск' })
  await combo.fill(vehicleId)
  await page.getByRole('listbox').getByRole('option', { name: new RegExp(vehicleId) }).first().click()
  await page.getByLabel('Проверка').selectOption(sessionId)
}

export async function runDiagnosis(page: Page) {
  await page.getByRole('button', { name: /Получить результат диагностики|Получаем результат/ }).click()
}

export async function openNav(page: Page, label: RegExp | string) {
  await page.getByRole('button', { name: label }).click()
}