import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { defineConfig } from '@playwright/test'

const root = join(__dirname, '..')
const venvPython = join(root, 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const python = process.env.E2E_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python')
const isolatedBackend = 'http://127.0.0.1:8091'
const isolatedFrontend = 'http://127.0.0.1:5174'
const external = Boolean(process.env.E2E_SKIP_SERVERS)
const mainURL = external ? (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173') : isolatedFrontend
const ticketURL = external ? (process.env.E2E_ISOLATED_BASE_URL ?? isolatedFrontend) : isolatedFrontend
const state = (url: string) => ({ cookies: [], origins: [{ origin: new URL(url).origin, localStorage: [{
  name: 'judrive-onboarding', value: JSON.stringify({ version: 1, status: 'completed', step: 6, acknowledged: true }),
}] }] })

// Managed E2E always uses disposable services, including test-only chief credentials.
// Never reuse a working backend, ticket database or real Groq key.
if (!external && !process.env.JUDRIVE_E2E_MANAGED) {
  process.env.JUDRIVE_E2E_MANAGED = '1'
  const password = randomBytes(24).toString('hex')
  const salt = randomBytes(16).toString('hex')
  process.env.CHIEF_USERNAME = 'e2e-chief'
  process.env.E2E_CHIEF_USER = 'e2e-chief'
  process.env.E2E_CHIEF_PASSWORD = password
  process.env.CHIEF_PASSWORD_HASH = `${salt}$${pbkdf2Sync(password, salt, 200000, 32, 'sha256').toString('hex')}`
  process.env.SESSION_SECRET = randomBytes(32).toString('hex')
  process.env.COOKIE_SECURE = 'false'
}
const localEnv = { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' }

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  globalSetup: external ? undefined : './fixtures/seed_required_ticket.ts',
  use: {
    baseURL: mainURL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    storageState: state(mainURL),
    launchOptions: process.env.E2E_CHROMIUM_EXECUTABLE ? { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE } : undefined,
  },
  projects: [
    { name: 'main', testIgnore: /ticket-journal\.spec\.ts/ },
    { name: 'tickets', testMatch: /ticket-journal\.spec\.ts/, use: { baseURL: ticketURL, storageState: state(ticketURL) } },
  ],
  webServer: external ? undefined : [
    {
      command: `"${python}" -m uvicorn mock_ml.app:app --host 127.0.0.1 --port 8005`,
      cwd: join(root, 'vendor', 'neurodvs_mock'), env: { ...localEnv, PYTHONPATH: '.' },
      url: 'http://127.0.0.1:8005/health', reuseExistingServer: false, timeout: 120_000,
    },
    {
      command: `"${python}" -m uvicorn mock_toir.app:app --host 127.0.0.1 --port 8003`,
      cwd: join(root, 'vendor', 'neurodvs_mock'), env: { ...localEnv, PYTHONPATH: '.' },
      url: 'http://127.0.0.1:8003/health', reuseExistingServer: false, timeout: 120_000,
    },
    {
      command: `"${python}" e2e/fixtures/fake_groq.py`, cwd: root, env: localEnv,
      url: 'http://127.0.0.1:8004/health', reuseExistingServer: false, timeout: 120_000,
    },
    {
      command: `"${python}" e2e/fixtures/isolated_backend.py`, cwd: root,
      env: { ...localEnv, PYTHONPATH: 'backend', DB_PATH: 'local-data/e2e/judrive-e2e.sqlite',
        MOCK_ML_URL: 'http://127.0.0.1:8005', MOCK_TOIR_URL: 'http://127.0.0.1:8003',
        GROQ_API_KEY: 'e2e-local-stub', GROQ_BASE_URL: 'http://127.0.0.1:8004/openai/v1',
      },
      url: `${isolatedBackend}/api/health`, reuseExistingServer: false, timeout: 300_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', cwd: join(root, 'frontend'),
      env: { ...localEnv, JUDRIVE_BACKEND_PORT: '8091' },
      url: isolatedFrontend, reuseExistingServer: false, timeout: 120_000,
    },
  ],
})
