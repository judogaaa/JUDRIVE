import { expect, test } from '@playwright/test'
import { loadDotEnv, openNav, runDiagnosis, selectVehicleSession } from './helpers/common'

test.beforeAll(() => loadDotEnv())

// This project runs against an isolated backend (port 8091), an isolated
// Mock TOiR instance (port 8003) and a fresh SQLite copy. The agent is a
// deterministic tool-calling stub, so the real RAG checks, ticket guards and
// Mock TOiR submission are still exercised without spending Groq quota.
test.describe('Ticket draft → confirm → journal', () => {
  test('ticket draft is prepared from sources, confirmed and protected from duplicates', async ({ page, request }) => {
    test.setTimeout(180_000)
    const health = (await (await request.get('/api/health')).json()) as { gigachat_agent?: string }
    expect(health.gigachat_agent).toBe('configured')

    let draftId = ''
    let confirmNonce = ''
    page.on('response', async (response) => {
      if (response.request().method() !== 'POST' || !response.url().includes('/messages')) return
      try {
        const body = (await response.json()) as { draft?: { draft_id?: string; confirm_nonce?: string } }
        if (body.draft?.draft_id && body.draft.confirm_nonce) {
          draftId = body.draft.draft_id
          confirmNonce = body.draft.confirm_nonce
        }
      } catch {
        /* no draft in reply */
      }
    })

    await page.goto('/')
    // Visit the same filtered journal before creating a new ticket. A stale
    // cached list must not consume the link to the later confirmed ticket.
    await openNav(page, 'Автопарк')
    await page.locator('.fleet-table tbody tr').filter({ hasText: 'E549YT198' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Заявки', exact: true }).click()
    await expect(page.locator('.filter-chip')).toContainText('E549YT198')
    await expect(page.locator('.toolbar-meta:visible')).toContainText('Показано')
    await openNav(page, 'Диагностика')
    await selectVehicleSession(page, 'E549YT198', 'S-0011')
    await runDiagnosis(page)
    await expect(page.locator('.verdict-card--anomaly')).toBeVisible({ timeout: 30_000 })
    await page.locator('.verdict-actions').getByRole('button', { name: 'Подготовить заявку' }).click()

    const draft = page.locator('.ticket-draft')
    await expect(draft.getByRole('heading', { name: 'Черновик заявки ТОиР' })).toBeVisible({ timeout: 120_000 })
    await expect(draft.getByText(/236/).first()).toBeVisible()
    const confirmButton = draft.getByRole('button', { name: 'Подтвердить и отправить заявку' })
    await expect(confirmButton).toBeDisabled()
    await draft.getByLabel('Я проверил факты, источники и работы').check()
    await confirmButton.click()
    await expect(page.getByText(/TKT-/)).toBeVisible({ timeout: 30_000 })

    await page.locator('.chat-log > .ticket-draft__ok').getByRole('button', { name: 'Заявки', exact: true }).click()
    const openedTicket = page.locator('.ticket-drawer')
    await expect(openedTicket).toBeVisible()
    await expect(openedTicket.getByRole('button', { name: /E549YT198/ })).toBeVisible()
    await expect(openedTicket).toContainText('S-0011')

    expect(draftId).toBeTruthy()
    expect(confirmNonce).toBeTruthy()
    const duplicate = await request.post(`/api/tickets/drafts/${draftId}/confirm`, {
      data: { acknowledge: true, confirm_nonce: confirmNonce },
    })
    expect(duplicate.ok()).toBeTruthy()
    expect((await duplicate.json()).status).toMatch(/duplicate|error/)
  })

  test('UI confirm S-0008 and duplicate confirm blocked', async ({ page, request }) => {
    test.setTimeout(180_000)
    const health = await request.get('/api/health')
    const h = (await health.json()) as { gigachat_agent?: string }
    expect(h.gigachat_agent).toBe('configured')

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
  })

  test('journal lists ticket and opens detail', async ({ page, request }) => {
    const list = await request.get('/api/tickets?vehicle_id=B418HK98')
    const { tickets } = (await list.json()) as { tickets: { ticket_id: string }[] }
    expect(tickets.length).toBeGreaterThan(0)

    await page.goto('/')
    await openNav(page, 'Заявки')
    const row = page.locator('.ticket-row').filter({ hasText: /B418HK98/ }).first()
    await expect(row.getByText(/TKT-/)).toBeVisible()
    await row.locator('.ticket-row__head').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: /B418HK98/ })).toBeVisible()
  })
})
