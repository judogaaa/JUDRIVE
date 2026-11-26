# JUDRIVE

AI-powered engine diagnostics and intelligent fleet management platform.

**Диагностика, которой можно доверять.** JUDRIVE — прототип ИИ-агента «Цифровой механик» для хакатона «ИИкузница» от «Софтлайн Решения», трек «Цифровой аватар». Агент преобразует результат акустической ML-диагностики в понятные механику рекомендации с проверяемыми ссылками на руководства и помогает оформлять заявки на дефектовку. Главный механик видит историю, состояние и приоритеты автопарка.

## Статус

**26.11.2026 — этап 01 готов.** Скелет React + FastAPI, загрузка 50 ТС / 195 сессий, прокси `POST /api/diagnose` в оригинальный Mock ML, health обеих заглушек. LLM/RAG/ТОиР-заявки в UI ещё не реализованы (этапы 02+).

## Локальный запуск (этап 01)

Требования: Python 3.11+ (проверено на 3.14), Node.js LTS, UTF-8 в терминале Windows.

1. Скопируйте `.env.example` в `.env` при необходимости (значения по умолчанию совпадают).
2. Заглушки заказчика (из корня репозитория, **не меняя** `vendor/neurodvs_mock`):

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

3. Backend JUDRIVE:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

4. Frontend (прокси `/api` → `127.0.0.1:8080`):

```powershell
cd frontend
npm install
npm run dev
```

Откройте `http://127.0.0.1:5173`. Проверка health: `GET http://127.0.0.1:8080/api/health` (ожидается `mock_ml` и `mock_toir` = `up`).

### Быстрые smoke-тесты

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r ..\tests\requirements-dev.txt
cd ..
pytest -q tests/test_stage01_api.py tests/test_stage01_fleet.py
```

Параметрические вызовы Mock ML в `test_stage01_fleet.py` выполняются только если заглушка на порту 8001 уже запущена.

### Контрольные пары (docs/ACCEPTANCE.md)

| Пара | Ожидаемый `status` |
|------|---------------------|
| M333YK47 / S-0006 | `normal` |
| B418HK98 / S-0009 | `anomaly` |
| P456AT178 / S-0003 | `check_failed` (scores = `null`) |

Сборка UI: `cd frontend && npm run build`.

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
