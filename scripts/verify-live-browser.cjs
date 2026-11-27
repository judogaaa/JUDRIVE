const { chromium } = require('@playwright/test')
const { readFileSync } = require('node:fs')
const { setTimeout: delay } = require('node:timers/promises')

async function main() {
  const port = Number(process.argv[2])
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port')
  const credentials = JSON.parse(readFileSync(0, 'utf8'))
  const base = 'http://127.0.0.1:' + port
  let ready = false
  for (let attempt = 0; attempt < 20 && !ready; attempt++) {
    try {
      ready = (await fetch(base + '/api/live', { signal: AbortSignal.timeout(1500) })).ok
    } catch { /* tunnel is still opening */ }
    if (!ready) await delay(500)
  }
  if (!ready) throw new Error('SSH tunnel is unavailable')
  const browser = await chromium.launch(process.env.E2E_CHROMIUM_EXECUTABLE ? { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE } : {})
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      try {
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', () => errors.push('page error'))
        page.on('console', (message) => { if (message.type() === 'error') errors.push('console error') })
        await page.goto(base)
        await page.getByRole('heading', { name: 'Вход в JUDRIVE' }).waitFor()
        if (await page.locator('.shell').count()) throw new Error('Workspace present before login')
        await page.getByLabel('Имя', { exact: true }).fill(credentials.username)
        await page.getByLabel('Пароль', { exact: true }).fill(credentials.password)
        await page.getByRole('button', { name: 'Войти', exact: true }).click()
        await page.getByRole('button', { name: 'Пропустить' }).click()
        await page.getByRole('heading', { name: 'Главная', exact: true }).waitFor()
        await page.getByRole('heading', { name: 'Последние проверки' }).waitFor()
        for (const name of ['Диагностика', 'Автопарк', 'Руководства', 'Заявки', 'Главный механик']) {
          await page.locator('.shell-nav, .shell-nav-mobile').getByRole('button', { name, exact: true }).click()
          await page.getByRole('heading', { name, exact: true }).first().waitFor()
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
            throw new Error('Horizontal overflow at ' + width + 'px')
          }
        }
        await page.getByRole('button', { name: 'Выйти', exact: true }).click()
        await page.getByRole('heading', { name: 'Вход в JUDRIVE' }).waitFor()
        if (errors.length) throw new Error('Browser errors at ' + width + 'px')
        console.log('PASS: browser smoke at ' + width + 'px')
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('FAIL: browser step (' + error.name + ')')
  process.exitCode = 1
})
