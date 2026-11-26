import { defineConfig } from '@playwright/test'

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
  },
  webServer: process.env.E2E_SKIP_SERVERS
    ? undefined
    : [
        {
          command: process.env.E2E_BACKEND_CMD ?? 'backend\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8090',
          cwd: process.env.E2E_ROOT ?? '..',
          env: { ...process.env, PYTHONPATH: 'backend' },
          url: 'http://127.0.0.1:8090/api/health',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'npm run dev -- --host 127.0.0.1 --port 5173',
          cwd: process.env.E2E_FRONTEND ?? '../frontend',
          env: { ...process.env, JUDRIVE_BACKEND_PORT: '8090' },
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
})