# JUDRIVE

AI-powered engine diagnostics and intelligent fleet management platform.

**Диагностика, которой можно доверять.** JUDRIVE — прототип ИИ-агента «Цифровой механик» для хакатона «ИИкузница» от «Софтлайн Решения», трек «Цифровой аватар». Агент преобразует результат акустической ML-диагностики в понятные механику рекомендации с проверяемыми ссылками на руководства и помогает оформлять заявки на дефектовку. Главный механик видит историю, состояние и приоритеты автопарка.

## Статус

**26.11.2026 — этапы 01–06 готовы.** Голос (Groq Whisper) и 7 языков UI/агента.

## Локальный запуск (этапы 01–03)

Требования: Python 3.11+ (проверено на 3.14), Node.js LTS, UTF-8 в терминале Windows.

1. Скопируйте `.env.example` в `.env`; для чата добавьте `GROQ_API_KEY` (только локально, файл в `.gitignore`). Кабинет главного механика: `CHIEF_USERNAME`, `CHIEF_PASSWORD_HASH` (`python scripts/hash_chief_password.py`), `SESSION_SECRET`. Пароль в Git не кладётся. На HTTPS задайте `COOKIE_SECURE=true`.
2. **PDF (этап 02):** положите шесть оригиналов в `materials/manuals/` (папка в `.gitignore`) по [docs/SOURCES.md](docs/SOURCES.md). Быстрое копирование, если файлы уже в `Documents`:

```powershell
.\scripts\sync_manuals.ps1
# или указать каталог: .\scripts\sync_manuals.ps1 -SourceDir "D:\path\to\pdfs"
```
3. Заглушки заказчика (из корня репозитория, **не меняя** `vendor/neurodvs_mock`):

```powershell
cd vendor/neurodvs_mock
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Терминал A:
uvicorn mock_ml.app:app --port 8001
# Терминал B:
uvicorn mock_toir.app:app --port 8002
```

4. Backend и заглушки одной командой (из корня, `PYTHONPATH=backend`, порт по умолчанию **8090**):

```powershell
.\scripts\start_local.ps1
# другой порт: $env:JUDRIVE_BACKEND_PORT='8080'; .\scripts\start_local.ps1
```

Ручной запуск backend:

```powershell
cd $repoRoot
$env:PYTHONPATH = "backend"
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8090
```

Индекс в `local-data/judrive.sqlite` строится при старте (~2 мин при первом запуске).

5. Frontend (прокси `/api` → порт из `JUDRIVE_BACKEND_PORT`, по умолчанию `8090`):

```powershell
cd frontend
$env:JUDRIVE_BACKEND_PORT = "8090"
npm install
npm run dev
```

Откройте `http://127.0.0.1:5173`. Health: `GET /api/health` — `mock_ml`, `mock_toir`, `manuals_index`, `groq_agent` (при подключённых PDF и ключе Groq).

**RAG API:** `POST /api/manuals/search`, `GET /api/sources/evidence/{id}`, `GET /api/sources/pdf/{doc_id}`.

**Агент (этап 03):** `POST /api/conversations` `{ vehicle_id, session_id }`, `POST /api/conversations/{id}/messages`, `POST /api/tickets/drafts/{id}/confirm` с `acknowledge: true`.

**Аналитика парка (этап 05):** `GET /api/fleet/dashboard`, `GET /api/fleet/vehicles/{vehicle_id}/insight` — категории, очередь, график anomaly_score, ранние предупреждения; данные из `vehicles.json` + журнал заявок.

**Голос (этап 06):** `POST /api/voice/transcribe` (multipart audio + `locale`); в UI — кнопка записи в диагностике и чате. Заявки только явной кнопкой, не голосом.

**Языки (этап 06):** переключатель в шапке — ru, uz, kk, tg, ky, hi, bn; ответ агента на выбранном языке, RAG по русским техтерминам.

Переиндексация: `scripts\build_manual_index.py`. Контроль RAG: `scripts\verify_rag_queries.py`. Контроль агента (live Groq + mocks): `backend\.venv\Scripts\python.exe scripts\verify_agent_scenarios.py`.

**Groq (этап 03):** добавьте `GROQ_API_KEY` в локальный `.env` (см. `.env.example`, в Git не коммитить). После смены кода перезапускайте backend с `--reload`. Чат в UI; сценарии: `backend\.venv\Scripts\python.exe scripts\verify_agent_scenarios.py`.

### Быстрые smoke-тесты

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r ..\tests\requirements-dev.txt
cd ..
pytest -q tests/
```

Параметрические вызовы Mock ML в `test_stage01_fleet.py` выполняются только если заглушка на порту 8001 уже запущена.

### Контрольные пары (docs/ACCEPTANCE.md)

| Пара | Ожидаемый `status` |
|------|---------------------|
| M333YK47 / S-0006 | `normal` |
| B418HK98 / S-0009 | `anomaly` |
| P456AT178 / S-0003 | `check_failed` (scores = `null`) |

Сборка UI: `cd frontend && npm run build`.

### Playwright E2E (приёмка ML в UI)

При запущенных заглушках, backend `:8090` и `npm run dev` в `frontend/`:

```powershell
npm install
npx playwright install chromium
$env:E2E_SKIP_SERVERS = "1"
npm run e2e
```

Сценарии: `normal` / `anomaly` / `check_failed` и переход «Найти в руководстве» — см. `e2e/diagnosis-status.spec.ts`, матрица — [docs/REQUIREMENTS_MATRIX.md](docs/REQUIREMENTS_MATRIX.md).

### UI (этап 04)

- Оболочка: **Диагностика** / **Автопарк** / **Заявки**, светлая/тёмная/системная тема, Manrope, Lucide.
- Диагностика: вердикт, история сессий, RAG, чат с кликабельными источниками и PDF drawer, подтверждение черновика.
- Адаптив: мобильная навигация, полноэкранный drawer на узком экране.

**Универсальные наработки (read-only референс):** [industrial-safety-ai-platform](https://github.com/judogaaa/industrial-safety-ai-platform) — адаптированы идеи `application.css` (токены/темы), `WorkspaceShell`, `EvidenceDrawer` → `SourceDrawer` и shell в `frontend/src/`; оригинальный репозиторий не изменялся.

## Быстрый вход для разработчика или нового ИИ-чата

1. [AGENTS.md](AGENTS.md) — правила работы.
2. [PROGRESS.md](PROGRESS.md) — фактически выполненное и следующий шаг.
3. [TASKS.md](TASKS.md) — этапы и критерии готовности.
4. [ARCHITECTURE.md](ARCHITECTURE.md) — технические решения.
5. [docs/MASTER.md](docs/MASTER.md) — полное досье и все зафиксированные решения.
6. [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — требования заказчика и организаторов.
7. [docs/DESIGN.md](docs/DESIGN.md) — продуктовый интерфейс.
8. [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) — сценарии проверки.
9. [docs/SOURCES.md](docs/SOURCES.md) — состав исходных материалов и порядок их подключения.
10. [docs/ORGANIZER_QA.md](docs/ORGANIZER_QA.md) — полный конспект 24 вопросов, брифинга и регламента.
11. [docs/SOURCE_MANIFEST.json](docs/SOURCE_MANIFEST.json) — контрольные SHA-256 оригиналов и заглушек.
12. [docs/REGULATION.md](docs/REGULATION.md) — актуальная система отбора, оценки и сдачи; оставшиеся материалы.
13. [docs/START_HERE.md](docs/START_HERE.md) — первый этап и переход между Cursor/OpenCode.
14. [vendor/neurodvs_mock/](vendor/neurodvs_mock/) — оригинальные заглушки, OpenAPI, тесты и синтетический набор заказчика.

## Планируемые возможности

- 50 синтетических машин и 195 проверок; реальные вызовы предоставленных Mock ML и Mock ТОиР.
- Поиск по шести техническим руководствам (1743 страницы), точные источники.
- Объяснение отклонения, управление риском, подтверждение заявки пользователем.
- История, график динамики и сводка главного механика.
- Голосовой ввод и мультиязычный адаптивный интерфейс.

Планируемый стек: React + TypeScript + Vite, FastAPI, SQLite, Groq GPT-OSS 120B, Whisper, локальная база знаний и PDF.js. Прототип не обучает акустическую ML-модель, не подтверждает техническую исправность двигателя и не заменяет специалиста. Публикация полных PDF требует ясности прав на распространение. Оригинальные Mock API и синтетические данные уже находятся в vendor/neurodvs_mock; шесть полных PDF подключаются по инструкции из docs/SOURCES.md.

Ориентир завершения: 28.11.2026 10:00 МСК; рабочий стенд требуется согласно актуальным правилам хакатона. Текущее состояние всегда в PROGRESS.md.
