# HTTPS-развёртывание JUDRIVE (этап 07)

## Состав стенда

1. **Mock ML** — `vendor/neurodvs_mock`, порт 8001.
2. **Mock ТОиР** — порт 8002.
3. **Backend** — `uvicorn app.main:app` из `backend/`, `PYTHONPATH=backend`, порт 8090 (или через reverse proxy).
4. **Frontend** — `npm run build` → статика из `frontend/dist` за nginx/caddy **или** `vite preview` только для демо.

## Переменные окружения (`.env` в корне, не в Git)

- `MOCK_ML_URL`, `MOCK_TOIR_URL`
- `FLEET_DATA_PATH`, `PDF_DIR`, `MANUAL_DB_PATH`
- `GROQ_API_KEY` (опционально для агента/голоса)
- `CHIEF_PASSWORD_HASH` (bcrypt для кабинета главного механика)

## Reverse proxy (пример Caddy)

```
your-host.example {
  encode gzip
  handle /api/* {
    reverse_proxy 127.0.0.1:8090
  }
  handle {
    root * /var/www/judrive/dist
    try_files {path} /index.html
    file_server
  }
}
```

## Проверка после деплоя

1. `GET /api/health` — `ok`, mocks up.
2. Диагностика трёх статусов (см. `docs/ACCEPTANCE.md`).
3. Логин chief → `/api/fleet/dashboard` 200 с cookie.
4. PDF `/api/sources/pdf/{doc_id}` — `Content-Disposition: inline`.

## Сборка статики

```powershell
.\scripts\deploy_https.ps1
# Каталог по умолчанию: deploy\dist
```

На сервере: `COOKIE_SECURE=true`, `SESSION_SECRET`, ключи Groq/chief только в `.env`.

## Локальный паритет

`scripts/start_local.ps1` — backend 8090, frontend dev с прокси.

## Чек-лист после выкладки

```powershell
Invoke-WebRequest https://YOUR_HOST/api/health
$env:E2E_BASE_URL='https://YOUR_HOST'; $env:E2E_API_BASE='https://YOUR_HOST'; $env:E2E_SKIP_SERVERS='1'; npm run e2e
```