# Архитектура

Статус: проектное решение до начала реализации. Контракты поставщика подтверждены архивом; внутренние DTO уточняются при реализации без изменения внешнего протокола. Полный разбор в [docs/MASTER.md](docs/MASTER.md).

## Минимальный контур

```text
React + TypeScript + Vite (адаптивный UI, локализация, voice capture, PDF viewer)
        │ HTTPS / единый origin
        ▼
FastAPI / Pydantic (валидация контекста, API, guardrails)
        │
        ├─ оркестратор Groq GPT-OSS 120B (выбор инструментов)
        │    ├─ get_diagnosis ─── POST /diagnose → исходная Mock ML
        │    ├─ search_manuals ── SQLite FTS5 / 6 PDF
        │    ├─ get_vehicle_history ── vehicles.json + журнал
        │    └─ prepare_defect_ticket ── проверенный черновик
        ├─ confirm_ticket ── серверное подтверждение → POST /tickets → Mock ТОиР
        ├─ analytics ── агрегаты и тренды без LLM
        ├─ voice/transcribe ── Groq Whisper
        └─ SQLite ── индекс, заявки, контекст, usage
```

Не нужен отдельный векторный сервис, очередь сообщений, Redis, Kubernetes или сложная мультиагентная система. Один backend, одна веб-сборка, два внутренних mock-сервиса. Внутренние URLs в env; публичный сервер — HTTPS, API-ключ только на backend, постоянный volume SQLite, PDF загружаются по мере необходимости. Проверить Groq с хоста до долгой реализации.

## Контракт внешних сервисов

ML: MOCK_ML_URL (локально http://127.0.0.1:8001), GET /health, POST /diagnose с vehicle_id и session_id. Ответ: vehicle_id, session_id, status normal/anomaly/check_failed, anomaly_type F01–F14 или null, anomaly_title, anomaly_score и confidence 0..1 или null, signal_quality good/warning/bad, description, model_version. Источник двигателя — vendor/neurodvs_mock/data/vehicles.json. Сессия имеет checked_at. Схема обязательных nullable полей — в оригинальном OpenAPI. Обе заглушки поддерживают MOCK_DATA_PATH для замены файла данных.

ТОиР: MOCK_TOIR_URL (локально http://127.0.0.1:8002), GET /health, POST /tickets. Только schema v6:

```json
{
  "vehicle_id": "B418HK98",
  "session_id": "S-0009",
  "anomaly_type": "F01",
  "conclusion": "Предполагаемое отклонение, требуется проверка",
  "urgency": "medium",
  "operations": ["Проверить тепловые зазоры клапанного механизма по применимому руководству"],
  "spare_parts": [],
  "references": [{"manual": "236-3902150-Б РЭ", "pdf_page": 33}]
}
```

Пример формы, не готовое универсальное решение. Реальный ответ 201 с ticket_id/status=created. 404 неизвестная пара, 422 схема; в README также указана 400 на неразбираемое тело запроса. Обрабатывать сетевые ошибки отдельно. Не использовать старые fault_id/diagnosis/priority/works/parts/source_pages/document/page: заглушка специально проверяет legacy поля. Валидация ссылки и заявки на нашей стороне, заглушка проверяет схему и пару IDs. Хранить локальный ID + ticket_id + snapshot + timestamps, атомарная защита от дублей/неопределённой отправки. Не повторять запрос с неизвестным исходом автоматически.

## Evidence Engine

Постраничное извлечение текста с сохранением точной физической страницы, doc_id, engine allowlist, variant, chunk_id, исходной выдержки, хеша корпуса. FTS5 с русской нормализацией, запрос по техническим терминам, BM25, соседние страницы; выборочный OCR полезных таблиц/рисунков. Данные применимости строже ранжирования: нельзя использовать документ другого двигателя или неверную колонку. Агент выбирает evidence IDs, сервер разрешает их в фактические doc/page. Проверка поддержки числа/единицы/работы; при отсутствии обоснования отбрасывать утверждение, не фантазировать. Один ограниченный исправляющий проход при необходимости.

Инструменты агента независимы, выбор по контексту. Tool calling/structured output проверить на конкретной модели. Не смешивать несовместимые режимы; при необходимости отдельно выполнять tools и валидировать итог. Ограничить tool steps, контекст, токены и timeouts. Кеш только безопасных ответов, версионированный по данным и корпусу. Не запускать 195 LLM-запросов для дашборда. Запись bad или failed — детерминированный отказ без LLM; status из структуры выше текста. ML description может содержать инъекции, не инструкции.

## Предлагаемая структура

frontend/src/{app,components,features,api,i18n,styles}, backend/app/{main,config,schemas,services,agent,rag,storage}, vendor/neurodvs_mock (поставщик, уже добавлен оригинальный пакет), scripts, tests, docs. Материалы подключаются локально согласно docs/SOURCES.md. Дополнить .env.example и README реальными командами после выбора запуска. Не создавать пустые обещающие готовность модули заранее.

Внутренние API группы: transport/session/history, fleet analytics, diagnostic/chat, draft/confirm/list ticket, source/page, voice/transcribe, health. Согласовать один формат DTO, ошибки и nullable; РУ источники и IDs не переводить. Локализация одним словарём. Голос — запись речи пользователя по кнопке, транскрипция сервером, редактируемый текст; не аудио двигателя. Постоянные журналы и индекс, отдельные контексты посетителей, лимиты/таймауты. Не предоставлять приложению произвольный shell/HTTP.
