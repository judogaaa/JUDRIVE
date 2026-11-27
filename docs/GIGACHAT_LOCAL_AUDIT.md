# Локальный аудит GigaChat перед Ubuntu VPS

Проверена отдельная рабочая копия `feat/gigachat-integration` от `078f87751045f4d9b896b9bd4efad8f1d6fb1d01`. Предыдущая рабочая копия `fix/submission-hardening` осталась на `3b275d8`. Проверки использовали одноразовую SQLite и синтетические PDF. Внешние серверы для развёртывания и реальные заявки не использовались.

## PASS / FAIL / BLOCKED

| Проверка | Команда | Результат |
| --- | --- | --- |
| Зависимости | `npm ci` и `npm ci --prefix frontend` | PASS |
| Backend | `python -m pytest -q` | PASS, 221 тест, 0 пропусков. 3 предупреждения о TestClient и маркере pytest |
| Playwright и локальный запуск сервисов | `E2E_PYTHON=/workspace/work/judrive-venv/bin/python E2E_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run e2e` | PASS, 56 сценариев, 0 пропусков. Запущены Mock ML, Mock ТОиР, GigaChat stub, backend и Vite |
| TypeScript, production build, oxlint | Из `frontend/` — `./node_modules/.bin/tsc -b`, `npm run build`, `npm run lint` | PASS. Oxlint выдал 33 предупреждения React |
| RAG с синтетическими PDF | `PDF_DIR="$audit_dir/pdf" DB_PATH="$audit_dir/rag.sqlite" python scripts/verify_rag_queries.py` | PASS, 8/8, 6 документов и 1743 страницы. Проверены конфликт РЭ/РК, точная страница, отказ при чужом двигателе и отсутствии источника |
| Submission regression | `python scripts/verify_submission_regressions.py --synthetic-pdfs` | PASS, 37 проверок, включая 195 диагностик и локальный Mock ТОиР |
| Docker Compose и сборка | `JUDRIVE_DOMAIN=localhost docker compose config --quiet`, затем `JUDRIVE_DOMAIN=localhost JUDRIVE_RUNTIME_IMAGE=judrive-feat-runtime:local docker compose -p judrive-feat -f compose.yaml -f /tmp/judrive-feat-ca.yml build backend web` | PASS. Собраны оба образа для всех четырёх сервисов. Временный override подключал доверенный CA среды к PyPI/npm на этапе сборки |
| Docker запуск | `docker compose -p judrive-feat -f compose.yaml -f "$audit_dir/compose.yaml" up --no-build -d --wait --wait-timeout 100` и `restart backend` с теми же параметрами | PASS. ML, ТОиР и backend healthy. Caddy по loopback отдал frontend и API. Анонимные PDF и evidence дали 401, чужой двигатель 404, разрешённый PDF с внешнего read-only тома 206. История и черновик доступны после рестарта backend |
| Git и авторизация | `git diff --check`, `git diff --exit-code -- vendor/neurodvs_mock`, скан истории и HTTP-тесты доступа | PASS для проверенных шаблонов и маршрутов. Совпадений по шаблонам GitHub, Groq, AWS, JWT, Authorization Key и приватных ключей 0. В истории проверенных ссылок нет файлов `.env`, PDF или SQLite. В старом файле Playwright 0 cookies |
| GigaChat live и официальный валидатор | `python scripts/gigachat_smoke.py`, `python scripts/gigachat_smoke.py --validate-functions`, `python scripts/voice_smoke.py` | BLOCKED, в окружении нет Authorization Key. Для живой проверки native function calling нужен авторизованный стенд и вызов агента с выбранным инструментом |
| Оригинальные PDF и регресс сдачи с оригиналами | `python scripts/verify_original_manuals.py --pdf-dir materials/manuals`, `python scripts/verify_rag_queries.py`, `python scripts/verify_submission_regressions.py` | BLOCKED, разрешённые оригиналы отсутствуют |

Перед финальным прогоном pytest выявил устаревшее представление usage, а первая предметная проверка RAG выявила несогласованные ожидания статуса конфликта и пробел в синтетическом корпусе. Исправлены проверки и данные. SQLite миграция сохранила старый usage. На локальном транспорте проверены OAuth, список моделей, обновление до истечения, один refresh для восьми параллельных запросов, 401/403/429/timeout, вызов функции с `functions_state_id`, отклонение битых аргументов, upload/delete и MIME. При превышении числа попыток запрос завершается ошибкой.

В этой ветке `/api/health` сообщает наличие конфигурации GigaChat. Серверные обращения к реальной модели проверяются отдельным smoke. Синтетический Docker-контур использовал loopback `127.0.0.1:18182`, временные PDF и SQLite, тестовую учётную запись механика и локальный stub на порту 8004 внутри backend. Caddy и backend обходили сетевой прокси для внутренних имён контейнеров. Для повторения генерации PDF выполните `PYTHONPATH=backend python -c 'from e2e.fixtures.synthetic_manuals import generate; from pathlib import Path; import sys; generate(Path(sys.argv[1]))' "$audit_dir/pdf"`.

## Изменённые файлы

- Клиент, инструменты и API — `backend/app/services/gigachat.py`, `backend/app/agent/gigachat_client.py`, `backend/app/main.py`.
- Запуск и сценарии — `compose.yaml`, `scripts/gigachat_smoke.py`, `scripts/voice_smoke.py`, `scripts/verify_rag_queries.py`, `scripts/verify_submission_regressions.py`.
- Тесты и фикстуры — `tests/test_gigachat.py`, `tests/test_document_access.py`, `tests/test_final_safety.py`, `e2e/fixtures/fake_gigachat.py`, `e2e/fixtures/synthetic_manuals.py`, `e2e/ticket-journal.spec.ts`.
- Документация — `docs/GIGACHAT.md`, `docs/GIGACHAT_LOCAL_AUDIT.md`, `PROGRESS.md`, `TASKS.md`.
