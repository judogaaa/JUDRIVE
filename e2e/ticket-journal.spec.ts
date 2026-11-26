import { expect, test } from '@playwright/test'
import { loadDotEnv, openNav, runDiagnosis, selectVehicleSession } from './helpers/common'

test.beforeAll(() => loadDotEnv())

test.describe('Ticket draft → confirm → journal', () => {
  test('journal lists ticket and opens detail', async ({ page, request }) => {
    const list = await request.get('/api/tickets?vehicle_id=B418HK98')
    const { tickets } = (await list.json()) as { tickets: { ticket_id: string }[] }
    test.skip(!tickets?.length, 'Нет заявок в журнале')

    await page.goto('/')
    await openNav(page, 'Заявки')
    const row = page.locator('.ticket-row').filter({ hasText: /B418HK98/ }).first()
    await expect(row.getByText(/TKT-/)).toBeVisible()
    await row.locator('.ticket-row__head').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: /B418HK98/ })).toBeVisible()
  })

  test('UI groq S-0008 confirm and duplicate confirm blocked', async ({ page, request }) => {
    test.setTimeout(180_000)
    const health = await request.get('/api/health')
    const h = (await health.json()) as { groq_agent?: string }
    test.skip(h.groq_agent !== 'configured', 'Groq not configured')

    const list = await request.get('/api/tickets?vehicle_id=B418HK98')
    const prior = ((await list.json()) as { tickets: { session_id: string }[] }).tickets ?? []
    test.skip(prior.some((t) => t.session_id === 'S-0008'), 'S-0008 already has ticket')

    let draftId = ''
    let confirmNonce = ''
    page.on('response', async (response) => {
      if (response.request().method() !== 'POST') return
      if (!response.url().includes('/messages')) return
      try {
        const body = (await response.json()) as {
          draft?: { draft_id?: string; confirm_nonce?: string }
        }
        if (body.draft?.draft_id && body.draft.confirm_nonce) {
          draftId = body.draft.draft_id
          confirmNonce = body.draft.confirm_nonce
        }
      } catch {
        /* ignore */
      }
    })

    await page.goto('/')
    await selectVehicleSession(page, 'B418HK98', 'S-0008')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible({ timeout: 30_000 })
    await page.locator('.verdict-actions').getByRole('button', { name: 'Подготовить заявку' }).click()

    await expect(page.getByRole('heading', { name: 'Черновик заявки ТОиР' })).toBeVisible({ timeout: 120_000 })
    await page.getByLabel('Я проверил факты, источники и работы').check()
    await page.getByRole('button', { name: 'Подтвердить и отправить заявку' }).click()
    await expect(page.getByText(/TKT-/)).toBeVisible({ timeout: 30_000 })

    expect(draftId).toBeTruthy()
    expect(confirmNonce).toBeTruthy()
    const dup = await request.post(`/api/tickets/drafts/${draftId}/confirm`, {
      data: { acknowledge: true, confirm_nonce: confirmNonce },
    })
    expect(dup.ok()).toBeTruthy()
    const dupBody = await dup.json()
    expect(dupBody.status).toMatch(/duplicate|error/)

    await openNav(page, 'Заявки')
    await expect(page.locator('.ticket-journal .ticket-row__id').filter({ hasText: /TKT-/ }).first()).toBeVisible({
      timeout: 15_000,
    })
  })
})