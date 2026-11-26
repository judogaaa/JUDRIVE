# Матрица требований организаторов (финальная приёмка, 26.11.2026)

## Обязательные продуктовые сценарии (ACCEPTANCE / С1–С3)

| ID | Требование | Подтверждение | Автопроверка |
|----|------------|---------------|--------------|
| O1 | POST /diagnose, session_id, реальный Mock ML | API + UI | `e2e/diagnosis-status.spec.ts`, `test_stage01_api.py` |
| O2 | Normal: не гарантия, без заявки | Verdict + guardrails | E2E `normal`, `verify_agent_scenarios --only normal` |
| O3 | Anomaly F01: гипотеза, RAG, черновик, TKT | Agent + Mock ТОиР | `e2e/ticket-journal.spec.ts` (изолированная SQLite + Mock ТОиР), реальные `TKT-0008/TKT-0010/TKT-0015` в рабочей БД, `test_stage03_guardrails.py` |
| O4 | check_failed: повтор, null scores, без заявки | Verdict + agent | E2E `check_failed` + `final-ux`, `verify_agent_scenarios --only check_failed` |
| O5 | RAG по двигателю, PDF 1-based, отказ | FTS + drawer | `verify_rag_queries.py` 8/8, `e2e/journey-manual-pdf-chat.spec.ts` |
| O6 | Повторная отправка заявки | dedup repository | `test_stage03_guardrails.py`, E2E duplicate confirm |
| O7 | Инъекции в description не исполняются | guardrails | `test_stage03_guardrails.py`, submission regression |
| O8 | Контракт ТОиР v6, без старых полей | openapi + mocks | vendor OpenAPI + pytest |

## Дополнения по ТЗ (B1–B3) и UX

| ID | Требование | Подтверждение / ограничение |
|----|------------|----------------------------|
| B1 | Память по машине и заявкам | get_vehicle_history: проверки и последние созданные заявки; выполнение ремонта не подтверждается |
| B2 | График последних валидных записей | реальные точки из истории, failed не превращается в ноль |
| B3 | Кабинет главного механика | 50 ТС, кликабельные категории, приоритеты, история; отдельная запись рекомендации chief с основанием. `quarantine_recommended` — рекомендация, `quarantine_confirmed` всегда `false`, пока нет фактического workflow карантина |
| UX1 | 7 языков UI/агента | 397 ключей × 7; kk/tg/ky/hi/bn без uz-fallback и mojibake, даты локализованы; onboarding/help/FAQ переведены; качество live-агента ограничено квотой Groq |
| UX2 | Голос STT | `POST /api/voice/transcribe`; live smoke 26.11.2026 — HTTP 200 (`whisper-large-v3-turbo`) |
| UX3 | Мобильный UI, темы, переходы, PDF | Playwright 48/48: 1920/1440/1280/768/390, light/dark/system, lazy PDF viewer, локализованные ошибки/retry, Hindi fallback |
| UX4 | Источники и действия диагностики | автоматический поиск после anomaly, related sources, реальные PDF, без лишних токенов LLM |
| UX5 | Обязательное обучение первого входа | 7 шагов, progress, skip/close/complete, версия в localStorage, focus trap, Escape, ARIA, mobile, `prefers-reduced-motion`; `e2e/onboarding-help.spec.ts` |
| UX6 | Центр «Помощь и обучение» | 12 карточек с общим контентом обучения, поиск, 8 FAQ, переходы к функциям, повторный запуск, язык/тема; `e2e/onboarding-help.spec.ts` |
| UX7 | Контекстные подсказки | единый `HelpTip`: confidence, anomaly_score, failed, запрет заявки, рекомендация карантина vs фактический карантин, отсутствие источника, другая сессия |

## Демо и сдача

| ID | Артефакт | Статус |
|----|----------|--------|
| D1 | Видео ≤3 мин, сценарии С1–С3 | Скрипт: `docs/DEMO_SCRIPT.md`; запись ещё не выполнена |
| D2 | HTTPS URL | Инструкция: `docs/DEPLOY_HTTPS.md` + `scripts/deploy_https.ps1`; `compose.yaml` с healthchecks и Caddy проверен через `docker compose config`; публичный URL не заявлен |
| D3 | Excel стоимости | `submission/JUDRIVE_usage_cost_2026-11-26.xlsx` + `submission/USAGE_EVIDENCE.md`: 55 сообщений, 178 787 токенов, тариф Groq $0,15/$0,60, курс ЦБ 82,313 ₽ |
| D4 | Форма ЛК сдачи | Текст и чек-лист: `docs/SUBMISSION.md`; отправить вручную до 28.11.2026 10:00 МСК |

## Ручной минимум (не автоматизировано)

- C2 «перегон своим ходом» — детерминированный безопасный отказ; проверен `verify_agent_scenarios --only drive_permission` и regression.
- C991PH47 / warning confidence — автоматизировано в `e2e/final-ux.spec.ts`.
- Инъекции T792HO98 / H142OX78 / E622KM47 — pytest + разовый чат-smoke.
- Живой браузер: визуальный проход 1440×900 по диагностике, чату, руководствам, PDF, автопарку, заявкам, кабинету chief и помощи; горизонтальный overflow 0 на 1920/1440/1280/768/390.

Ограничения: квота Groq (26.11 C1 остановлен на HTTP 429, повторы не выполнялись); полные PDF вне Git; Docker daemon/Desktop на машине приёмки недоступны, поэтому полная сборка образов не запускалась. Публичный хост/домен для HTTPS не предоставлен — localhost не выдаётся за конкурсный стенд.

## Независимый регресс ветки сдачи

`python scripts/verify_submission_regressions.py`: оригинальные HTTP-маршруты
vendor через ASGI transport, 195 проверок, три инъекции, реальный Mock ТОиР,
двойная отправка, неизвестный исход, B1, chief 401/пароль/рекомендация,
7 локалей failed, C2, PDF 68. Изолированная SQLite, без внешнего Groq.
Соединения SQLite закрываются, temp cleanup не блокирует Windows.
RAG: шесть исходных PDF, 1743 физические страницы, 8/8 контрольных запросов;
Poppler layout устраняет смешение строк таблицы 68. 73 страницы остаются sparse
без OCR. Локальный прогон 26.11.2026: `pytest` **54 passed**,
Playwright **50 passed / 0 skipped**, production build без предупреждения о
размере чанков (vendor 229,74 KB, locales 229,98 KB, SourceViewer 449,69 KB).
`docker compose config --quiet` проверен с тестовым доменом; сборка образов и
live Groq C1 требуют запущенного Docker daemon/доступной квоты.
Контейнерный HTTPS-конфиг подготовлен; реальный хост/видео пока не подтверждены.
