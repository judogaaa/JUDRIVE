# JUDRIVE

AI-powered engine diagnostics and intelligent fleet management platform.

**Диагностика, которой можно доверять.** JUDRIVE — прототип ИИ-агента «Цифровой механик» для хакатона «ИИкузница» от «Софтлайн Решения», трек «Цифровой аватар». Агент преобразует результат акустической ML-диагностики в понятные механику рекомендации с проверяемыми ссылками на руководства и помогает оформлять заявки на дефектовку. Главный механик видит историю, состояние и приоритеты автопарка.

## Статус

**27.11.2026 — рабочая ветка `fix/submission-hardening`: основной LLM и STT переведены на GigaChat; live smoke с Authorization Key владельца ещё не выполнен.** Голос (GigaChat audio attachments), 7 языков UI/агента, обязательное обучение при первом входе и центр «Помощь и обучение». Локальный стенд :8090/:5173; публичный HTTPS URL ещё не заявлен.

## Первый вход и помощь

При первом открытии показывается компактное обучение из 7 шагов: диагностика, цифровой механик, руководства, заявки, автопарк/главный механик, языки и темы. Последний шаг требует явной отметки «Я ознакомился…»; после подтверждения открывается рабочая диагностика. Прогресс хранится в `localStorage` (`judrive-onboarding`, версия 1), закрытие окна запоминает шаг, «Пропустить» и завершение не открывают обучение повторно. Смена языка и темы прогресс не сбрасывает.

В нижней части левого меню (и кнопкой в мобильной шапке) доступен раздел **«Помощь и обучение»**: поиск по инструкциям, 12 раскрывающихся карточек с общим содержимым обучения, 8 FAQ, переключатели языка/темы и повторный запуск обучения. Контекстные подсказки объясняют confidence, anomaly_score, непригодную запись, отсутствие источника и отличие рекомендации карантина от фактического карантина. Обучение не вызывает LLM и не расходует токены.

## Локальный запуск

Требования: Python 3.12+, Node.js 22.12+, UTF-8 в терминале Windows.

1. Скопируйте `.env.example` в `.env`; для чата и голоса добавьте `GIGACHAT_CREDENTIALS` (Authorization Key; только локально, файл в `.gitignore`). Настройка scope, модели и TLS — в [docs/GIGACHAT.md](docs/GIGACHAT.md). Кабинет главного механика: `CHIEF_USERNAME`, `CHIEF_PASSWORD_HASH` (`python scripts/hash_chief_password.py`), `SESSION_SECRET`. Пароль в Git не кладётся. На HTTPS задайте `COOKIE_SECURE=true`.
2. **PDF (этап 02):** положите шесть оригиналов в `materials/manuals/` (папка в `.gitignore`) по [docs/SOURCES.md](docs/SOURCES.md). Быстрое копирование, если файлы уже в `Documents`:

```powershell
.\scripts\sync_manuals.ps1
# или указать каталог: .\scripts\sync_manuals.ps1 -SourceDir "D:\path\to\pdfs"
```
3. Подключите разрешённый `vehicles.json` вне Git (по умолчанию `local-data/external/vehicles.json`). Для ручного запуска задайте один абсолютный путь в `MOCK_DATA_PATH` у обеих заглушек и в `FLEET_DATA_PATH` у backend. Установите backend-зависимости командой `pip install -r backend/requirements.txt`. Запуск заглушек:

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

Откройте `http://127.0.0.1:5173`. Проверка процесса — `GET /api/live`. Готовность ML, ТОиР, индекса и выбранной модели — `GET /api/ready` (503 при недоступности). `GET /api/health` возвращает статусы зависимостей.

**RAG API:** `POST /api/manuals/search`, `GET /api/sources/evidence/{id}`, `GET /api/sources/pdf/{doc_id}`.

**Агент (этап 03):** `POST /api/conversations` `{ vehicle_id, session_id }`, `POST /api/conversations/{id}/messages`, `POST /api/tickets/drafts/{id}/confirm` с `acknowledge: true`.

**Аналитика парка (этап 05):** `GET /api/fleet/dashboard`, `GET /api/fleet/vehicles/{vehicle_id}/insight` — категории, очередь, график anomaly_score, ранние предупреждения; данные из `vehicles.json` + журнал заявок.

**Голос (этап 06):** `POST /api/voice/transcribe` (multipart audio + `locale`); в UI — кнопка записи в диагностике и чате. Заявки только явной кнопкой, не голосом.

**Языки (этап 06):** переключатель в шапке — ru, uz, kk, tg, ky, hi, bn; ответ агента на выбранном языке, RAG по русским техтерминам.

Переиндексация: `scripts\build_manual_index.py`. Контроль RAG: `scripts\verify_rag_queries.py`. Контроль агента (live GigaChat + mocks): `backend\.venv\Scripts\python.exe scripts\verify_agent_scenarios.py --live`.

**GigaChat (этап 03):** добавьте Authorization Key в `GIGACHAT_CREDENTIALS` локального `.env` (см. [docs/GIGACHAT.md](docs/GIGACHAT.md), в Git не коммитить). После смены кода перезапускайте backend с `--reload`. Чат в UI; сценарии: `backend\.venv\Scripts\python.exe scripts\verify_agent_scenarios.py --live`.

### Быстрые smoke-тесты

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r ..\tests\requirements-dev.txt
cd ..
pytest -q tests/
```

Pytest поднимает заглушки на временных локальных портах.

### Контрольные пары (docs/ACCEPTANCE.md)

| Пара | Ожидаемый `status` |
|------|---------------------|
| M333YK47 / S-0006 | `normal` |
| B418HK98 / S-0009 | `anomaly` |
| P456AT178 / S-0003 | `check_failed` (scores = `null`) |

Сборка UI: `cd frontend && npm run build`.

### Playwright E2E (приёмка ML в UI)

При установленных зависимостях backend и тестов (рабочий стенд и исходные PDF не нужны):

```powershell
npm install
npx playwright install chromium
npm run e2e
```

Playwright поднимает полностью изолированный тестовый стенд: ML `:8005`, ТОиР `:8003`, детерминированный LLM stub `:8004`, backend `:8091`, frontend `:5174` и свежую SQLite. Синтетические PDF создаются автоматически. Тестовые учётные данные генерируются на запуск, контрольная заявка создаётся через API с реальным RAG и Mock ТОиР. Внешний GigaChat API не используется: E2E запускает локальную детерминированную заглушку нативного function-calling протокола. При необходимости задайте `E2E_PYTHON` (путь к Python с зависимостями). `E2E_SKIP_SERVERS=1` предназначен только для самостоятельно поднятого одноразового тестового стенда — не для рабочей базы.

Набор Playwright — три статуса ML, warning, RAG/PDF/чат, related sources, черновик и подтверждение заявки с защитой от дублей, недоступность LLM-провайдера и сохранение текста, полный список 50 машин и поиск в кириллице/латинице, сессии, смена контекста во время запроса, изоляция графика истории, источники черновика в PDF, двойное нажатие диагностики, локализованные ошибки и retry, язык/тема/системный режим, mobile/tablet/desktop, автопарк со статус-фильтром, заявки и кабинет главного механика, обучение/помощь и семантика рекомендации карантина. Матрица — [docs/REQUIREMENTS_MATRIX.md](docs/REQUIREMENTS_MATRIX.md); сценарий демо ≤3 мин — [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

### UI

- Оболочка: **Диагностика** / **Автопарк** / **Руководства** / **Заявки** / **Главный механик** / **Помощь и обучение**, светлая/тёмная/системная тема, 7 локалей, Manrope (self-hosted, OFL), Lucide.
- Диагностика: вердикт, история сессий и график, related sources, RAG, чат с кликабельными источниками и PDF drawer, подтверждение черновика, защита от устаревших запросов.
- Автопарк: поиск, фильтры по марке/двигателю/типу/статусу, сортировка, карточка ТС и связанные сессии/заявки.
- PDF.js загружается отдельным чанком при открытии источника; есть fullscreen, zoom, fit-width, ввод страницы и возврат к цитате.
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
14. [vendor/neurodvs_mock/](vendor/neurodvs_mock/) — код заглушек, OpenAPI и тесты.

## Возможности

- 50 синтетических машин и 195 проверок; реальные вызовы предоставленных Mock ML и Mock ТОиР.
- Поиск по шести техническим руководствам (1743 страницы), точные источники.
- Объяснение отклонения, управление риском, подтверждение заявки пользователем.
- История, график динамики и сводка главного механика.
- Голосовой ввод и мультиязычный адаптивный интерфейс.

Стек: React + TypeScript + Vite, FastAPI, SQLite, GigaChat-3-Ultra для агента, GigaChat-2-Max с аудиовложениями для голоса, локальная база знаний и PDF.js. Прототип не обучает акустическую ML-модель, не подтверждает техническую исправность двигателя и не заменяет специалиста. Публикация полных PDF требует ясности прав на распространение. Код Mock API находится в `vendor/neurodvs_mock`. Разрешённый автопарк и PDF подключаются по [инструкции](docs/SOURCES.md).

Ориентир завершения: 28.11.2026 10:00 МСК; рабочий стенд требуется согласно актуальным правилам хакатона. Текущее состояние всегда в PROGRESS.md.

### Финальная сдача

- Контейнерная конфигурация HTTPS: [docs/DEPLOY_HTTPS.md](docs/DEPLOY_HTTPS.md) (`compose.yaml`, Caddy, Poppler).
- Детерминированная проверка настоящих vendor mock routes, PDF и SQLite в отдельной БД:
  `python scripts/verify_submission_regressions.py` (6 PDF в PDF_DIR, без GigaChat/сети).
- Live-проверка: `python scripts/verify_agent_scenarios.py --live`; `--only check_failed` выполняет только C3, а `--confirm` явно разрешает тестовый POST заявки.
- [Сценарий демо](docs/DEMO_SCRIPT.md), [матрица требований](docs/REQUIREMENTS_MATRIX.md), [пакет сдачи](docs/SUBMISSION.md), [Excel usage](submission/USAGE_EVIDENCE.md).

## Инженерное уточнение

Заявка требует уверенности от 0,50. При помехах нужна отдельная отметка. Приоритет можно изменить до отправки. Документальный сценарий требует оригиналов, подключённых локально. [Матрица](docs/REQUIREMENTS_MATRIX.md)

### Воспроизводимая финальная проверка

Установите зависимости backend и `tests/requirements-dev.txt`, затем выполните `python -m pytest`. Pytest запускает оригинальные Mock ML и Mock ТОиР на временных локальных портах и использует отдельную SQLite. Для браузерной проверки нужны Node.js, зависимости корня и frontend (`npm ci` в обеих папках) и Chromium (`npm run e2e:install` либо `E2E_CHROMIUM_EXECUTABLE`). Запустите `npm run e2e` с `E2E_PYTHON`, если Python с тестовыми зависимостями отсутствует в PATH. При необходимости укажите локальный кириллический TTF через `E2E_CYRILLIC_FONT`.

По умолчанию тесты генерируют синтетические PDF нужной длины и индексируют их реальным RAG. Браузерный стенд использует локальный LLM stub с тестовыми учётными данными, новую SQLite и временную сессию главного механика. Рабочий корпус, рабочая база, файл окружения и внешний провайдер для этих проверок не нужны.

Автопарк, диагностика и её история, руководства, чат, голос и заявки требуют сессию главного механика. [Итоги проверки](docs/FINAL_VERIFICATION.md) · [Методика стоимости](docs/COST.md)

Оригиналы проверяются отдельно командой `python scripts/verify_original_manuals.py --pdf-dir materials/manuals`. Без разрешённых файлов команда возвращает BLOCKED. Live C1 проверяется только на подготовленном изолированном стенде с оригиналами и настроенным провайдером: `python scripts/verify_agent_scenarios.py --only anomaly --live`. Скрипт запрашивает пароль без вывода на экран. Опциональный флаг `--confirm` отправляет тестовую заявку в Mock ТОиР.
