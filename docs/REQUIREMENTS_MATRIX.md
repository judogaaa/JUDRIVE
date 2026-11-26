# Матрица требований организаторов (финальная приёмка, 26.11.2026)

## Обязательные продуктовые сценарии (ACCEPTANCE / С1–С3)

| ID | Требование | Подтверждение | Автопроверка |
|----|------------|---------------|--------------|
| O1 | POST /diagnose, session_id, реальный Mock ML | API + UI | `e2e/diagnosis-status.spec.ts`, `test_stage01_api.py` |
| O2 | Normal: не гарантия, без заявки | Verdict + guardrails | E2E `normal` |
| O3 | Anomaly F01: гипотеза, RAG, черновик, TKT | Agent + Mock ТОиР | E2E `anomaly`, `ticket-journal`, `final-ux` (черновик→подтверждение→duplicate, реальный TKT-0010), `test_stage03_guardrails.py` |
| O4 | check_failed: повтор, null scores, без заявки | Verdict + agent | E2E `check_failed` + `final-ux` (причина, выбор проверки), `verify_agent_scenarios --only check_failed` |
| O5 | RAG по двигателю, PDF 1-based, отказ | FTS + drawer | `verify_rag_queries.py` 8/8, `e2e/journey-manual-pdf-chat.spec.ts` |
| O6 | Повторная отправка заявки | dedup repository | `test_stage03_guardrails.py`, E2E duplicate confirm |
| O7 | Инъекции в description не исполняются | guardrails | `test_stage03_guardrails.py` |
| O8 | Контракт ТОиР v6, без старых полей | openapi + mocks | vendor OpenAPI + pytest |

## Бонусы и полнота (B1–B3, С4, UI)

| ID | Требование | Подтверждение | Автопроверка |
|----|------------|---------------|--------------|
| B1 | 7 языков UI/агента | locale parity | `test_stage06_voice_i18n.py`, `e2e/context-preferences.spec.ts` |
| B2 | Голос STT (HTTPS) | POST /voice | `test_stage06` + live на HTTPS-стенде |
| B3 | Главный механик: 50 ТС, категории, переходы | dashboard + cookies | `test_stage05_analytics.py`, `e2e/chief-dashboard.spec.ts` (неверный пароль/401), `e2e/final-ux.spec.ts` (подписанная сессия, пагинация) |
| B4 | Мобильный UI | shell / diagnosis | `e2e/context-preferences.spec.ts` (390px), `e2e/final-ux.spec.ts` (1920/1440/1280/768/390 без overflow) |
| B5 | Контекст машина/сессия между разделами | App intents | `e2e/context-preferences.spec.ts`, `final-ux.spec.ts` (автопарк→диагностика, заявка→диагностика) |
| B6 | Темы light/dark/system | tokens | E2E dark + light/system (`context-preferences`) |
| B7 | Публичный репозиторий, README, воспроизводимый запуск | docs | README, `start_local.ps1`, `deploy_https.ps1` |

## Демо и сдача

| ID | Артефакт | Статус |
|----|----------|--------|
| D1 | Видео ≤3 мин, сценарии С1–С3 | Скрипт: `docs/DEMO_SCRIPT.md` |
| D2 | HTTPS URL | Инструкция: `docs/DEPLOY_HTTPS.md` + `scripts/deploy_https.ps1` |
| D3 | Excel стоимости | Шаблон заказчика — заполнить после замеров Groq |
| D4 | Форма ЛК сдачи | Вручную 28.11 |

## Ручной минимум (не автоматизировано)

- С2 «перегон своим ходом» — один вопрос в чат с проверкой цитаты/отказа.
- C991PH47 / warning confidence — автоматизировано в `e2e/final-ux.spec.ts`.
- Инъекции T792HO98 / H142OX78 / E622KM47 — pytest + разовый чат-smoke.

Ограничения: Groq квота (контрольный прогон `verify_agent_scenarios --only check_failed`); полные PDF вне Git. Полный вход chief в E2E по паролю требует `E2E_CHIEF_PASSWORD`; без него проверяются форма, 401 и подписанная серверная сессия.