import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

const root = join(__dirname, '..')
const python = join(root, 'backend', '.venv', 'Scripts', 'python.exe')
const isolatedBackend = 'http://127.0.0.1:8091'
const isolatedFrontend = 'http://127.0.0.1:5174'

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    storageState: 'e2e/storage-state.json',
  },
  projects: [
    {
      name: 'main',
      testIgnore: /ticket-journal\.spec\.ts/,
    },
    {
      name: 'tickets',
      testMatch: /ticket-journal\.spec\.ts/,
      use: { baseURL: process.env.E2E_ISOLATED_BASE_URL ?? isolatedFrontend },
    },
  ],
  webServer: process.env.E2E_SKIP_SERVERS
    ? undefined
    : [
        {
          command: process.env.E2E_BACKEND_CMD ?? `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8090`,
          cwd: process.env.E2E_ROOT ?? root,
          env: { ...process.env, PYTHONPATH: 'backend' },
          url: 'http://127.0.0.1:8090/api/health',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'npm run dev -- --host 127.0.0.1 --port 5173',
          cwd: join(root, 'frontend'),
          env: { ...process.env, JUDRIVE_BACKEND_PORT: '8090' },
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: `"${python}" -m uvicorn mock_toir.app:app --host 127.0.0.1 --port 8003`,
          cwd: join(root, 'vendor', 'neurodvs_mock'),
          env: { ...process.env, PYTHONPATH: '.' },
          url: 'http://127.0.0.1:8003/health',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: `"${python}" e2e\\fixtures\\fake_groq.py`,
          cwd: root,
          url: 'http://127.0.0.1:8004/health',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: `"${python}" e2e\\fixtures\\isolated_backend.py`,
          cwd: root,
          env: {
            ...process.env,
            PYTHONPATH: 'backend',
            DB_PATH: 'local-data/e2e/judrive-e2e.sqlite',
            MOCK_TOIR_URL: 'http://127.0.0.1:8003',
            GROQ_API_KEY: 'e2e-local-stub',
            GROQ_BASE_URL: 'http://127.0.0.1:8004/openai/v1',
          },
          url: `${isolatedBackend}/api/health`,
          reuseExistingServer: false,
          timeout: 180_000,
        },
        {
          command: 'npm run dev -- --host 127.0.0.1 --port 5174',
          cwd: join(root, 'frontend'),
          env: { ...process.env, JUDRIVE_BACKEND_PORT: '8091' },
          url: isolatedFrontend,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
})
