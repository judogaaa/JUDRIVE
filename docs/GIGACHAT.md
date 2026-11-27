# GigaChat API в JUDRIVE

Агент по умолчанию использует `GigaChat-3-Ultra`. Эта модель доступна физлицам в режиме Freemium. Если модель недоступна для учётной записи, readiness возвращает 503. Сменить модель можно только явной настройкой `GIGACHAT_MODEL`. [Модель Ultra](https://developers.sber.ru/docs/ru/gigachat/models/gigachat-3-ultra)

Заполните `GIGACHAT_CREDENTIALS` (Authorization Key из кабинета) и `GIGACHAT_SCOPE` в локальном `.env`. Scope должен соответствовать типу проекта. OAuth передаёт UUID в `RqUID`, учитывает `expires_at` в секундах и миллисекундах и обновляет токен при истечении или первом 401. При необходимости задайте путь к доверенному `GIGACHAT_CA_BUNDLE`, доступный процессу backend. [OAuth и TLS](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api)

Агент передаёт один системный промпт, историю и `functions` в `/v1/chat/completions`. Сервер выполняет инструменты и возвращает их результаты с ролью `function`, сохраняя `functions_state_id`. Ошибки и таймауты дают краткие сообщения без тела ответа провайдера. [Работа с функциями](https://developers.sber.ru/docs/ru/gigachat/guides/functions/overview)

Голос использует отдельно заданную `GIGACHAT_STT_MODEL`, по умолчанию `GigaChat-2-Max` с документированной поддержкой аудио. Backend проверяет сессию, объём до 8 МиБ и сигнатуру контейнера. Далее загружает файл с `purpose=general`, передаёт ID в `attachments` и запрашивает удаление файла после завершения. Пользователь может исправить транскрипцию до передачи агенту. [Форматы](https://developers.sber.ru/docs/ru/gigachat/guides/working-with-files) · [Модель Max](https://developers.sber.ru/docs/ru/gigachat/models/gigachat-2-max)

## Live-проверка

~~~bash
JUDRIVE_LIVE_GIGACHAT=1 python scripts/gigachat_smoke.py
JUDRIVE_LIVE_GIGACHAT=1 python scripts/voice_smoke.py --audio /private/test-russian.wav
python scripts/verify_agent_scenarios.py --only anomaly --live
~~~

Первый smoke проверяет OAuth, список моделей и короткий ответ. Голосовой smoke требует входа и разрешённой записи речи. C1 требует изолированного стенда с оригиналами. Для отправки заявки в тестовый Mock ТОиР нужен отдельный флаг `--confirm`. [Учёт расходов](COST.md)

## Локальный аудит интеграции

Токен обновляется до истечения. При HTTP 401 клиент повторяет запрос один раз. Параллельные запросы используют общий результат обновления. Сетевой таймаут, 403 и 429 не повторяются автоматически.

Проверка отправляет четыре описания из `TOOL_DEFINITIONS` в том виде, в котором их получает модель. Она выводит имя функции и число предупреждений. Запуск требует Authorization Key и не генерирует ответ модели. [Валидатор функций](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/function-validation)

```bash
JUDRIVE_LIVE_GIGACHAT=1 python scripts/gigachat_smoke.py --validate-functions
```

Для `scripts/voice_smoke.py` задайте адрес backend в `JUDRIVE_API_BASE`. Скрипт проверяет URL до запроса пароля. Для удалённого адреса обязателен HTTPS. Для localhost и loopback возможен HTTP без системного прокси. Скрипт входит без перенаправлений и выводит статус распознавания.
