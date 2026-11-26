# Матрица требований организаторов (26.11.2026)

| ID | Сценарий | Подтверждение | Автопроверка |
|----|-----------|---------------|--------------|
| A1 | Выбор ТС + session_id, POST /diagnose → ML | UI + API 200 | `e2e/diagnosis-status.spec.ts`, `test_stage01_api.py` |
| A2 | Normal: норма ≠ гарантия, без заявки | VerdictCard + guardrails | E2E `normal` (M333YK47/S-0006) |
| A3 | Anomaly: гипотеза, RAG, черновик, confirm → TKT | Agent tools + TicketDraftCard | E2E `anomaly` (B418HK98/S-0009), `test_stage03_guardrails.py` |
| A4 | check_failed: нет диагноза/заявки | Verdict + orchestrator skip | E2E `check_failed` (P456AT178/S-0003) |
| A5 | RAG: engine allowlist, evidence, PDF 1-based | search + SourceDrawer | `test_stage02_rag.py`, `verify_rag_queries.py` |
| A6 | Дедуп заявки по паре ТС/сессия | repository unique index | `test_stage03_guardrails.py` |
| A7 | Chief dashboard за сессией | `/api/auth/login` + cookies | ручной + API при `.env` |
| A8 | 7 локалей ключей | keys parity | `test_stage06_voice_i18n.py` |
| A9 | Голос STT (Groq) | VoiceCapture POST | smoke при GROQ_API_KEY |
| A10 | Контекст: диагностика → руководства/чат | ManualSearchIntent / ChatIntent | E2E `manual navigation` |

Ограничения: HTTPS-стенд — `docs/DEPLOY_HTTPS.md`; live Groq — квота.