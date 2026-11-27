# HTTPS-стенд JUDRIVE

Публичный запуск требует сервера с доступом к Docker registry, npm, PyPI и GigaChat API,
DNS имени с A/AAAA на сервер, свободных входящих TCP 80/443, разрешения на
демонстрацию руководств. Контейнеры ML/ТОиР/backend доступны только во внутренней сети.
Это конфигурация развёртывания, а не заявление о готовом публичном URL.

## Подготовка

1. На сервере checkout конкурсной ветки (после приёмки — main); Docker Engine и Compose v2.
2. Поместить оригиналы в приватный каталог и указать `JUDRIVE_MANUALS_DIR`. Так же задать `JUDRIVE_FLEET_DIR` для разрешённого `vehicles.json`. [Подключение материалов](SOURCES.md)
   Не коммитить PDF; не раскрывать их вне разрешённого организаторами режима.
3. Скопировать .env.example в .env. Указать собственные JUDRIVE_DOMAIN (только доменное имя),
   GIGACHAT_CREDENTIALS (Authorization Key из кабинета GigaChat API), GIGACHAT_SCOPE,
   CHIEF_USERNAME, CHIEF_PASSWORD_HASH (PBKDF2 SHA-256 через
   python scripts/hash_chief_password.py после установки backend dependencies),
   случайный SESSION_SECRET (например python -c "import secrets; print(secrets.token_hex(32))").
   Хеш со знаком доллара записать в одинарных кавычках для Compose. Не использовать общие/демо пароли.
   Если серверу не хватает доверенных корневых сертификатов, установите CA Минцифры или задайте
   GIGACHAT_CA_BUNDLE. Не отключайте TLS verification.
4. Создать local-data/ и materials/manuals/ с правами чтения/записи на сервере.
   Использовать отдельную БД сдачи; резервная копия существующей БД — SQLite backup, не копия активного WAL.

~~~sh
docker compose config --quiet
docker compose build backend web
docker compose up -d --no-build
docker compose logs -f backend
~~~

В первый запуск backend строит индекс. Poppler сохраняет строки и столбцы таблиц;
без Poppler локальный pypdf fallback может терять формат. Для полного качества рекомендуется
установить pdftotext (Windows: Poppler в PATH; Linux: poppler-utils), пересобрать индекс.
Compose содержит healthchecks для ML, ТОиР и backend; web стартует после readiness backend.
Caddy получает HTTPS-сертификат через ACME при доступном DNS/портах.
Состояние заявки/чата/рекомендаций в SQLite сохраняется между рестартами. Vendor Mock ТОиР
сам по себе хранит выданные номера в памяти, поэтому не останавливать его во время демонстрации.
Не запускать несколько реплик backend с одной SQLite без отдельной схемы координации.

## Приёмка снаружи

- Открыть `https://<домен>/api/live` и `/api/ready` из внешней сети. Readiness проверяет доступность настроенной модели, ML, ТОиР и индекса. На HTTPS используйте Secure cookie и перечислите разрешённые дополнительные origins в `CORS_ORIGINS`.
- Выполнить `JUDRIVE_LIVE_GIGACHAT=1 python scripts/gigachat_smoke.py` на сервере: проверяются OAuth, список моделей и короткий запрос к настроенной модели.
- Прогнать python scripts/verify_agent_scenarios.py --live --base-url https://<домен>
  с настоящим ключом в локальном окружении. --confirm отдельно разрешает фактический POST в Mock ТОиР.
- Открыть точную страницу PDF (inline, full screen), проверить микрофон/голос, все роли и обе темы.
- Вход chief: новый пароль, без cookie 401, после входа 200, cookie Secure/HttpOnly.
- На тестовом стенде выполнить E2E, не создавать бесконтрольно заявки в конкурсной БД.
- Проверить ссылку после обновления и доступ из внешней сети; оставить сервис до срока из регламента.
- Не записывать ключи/пароли в видео, публичный Excel, логи или Git. Проверить лимиты и остаток GigaChat в кабинете.
- Перед сдачей сделать backup SQLite и зафиксировать последний принятый commit/ref.

## Windows (локальная разработка)

scripts/start_local.ps1 + cd frontend; npm run dev. Публичный стенд не заменяется localhost.
scripts/deploy_https.ps1 собирает только статический frontend, TLS сам не поднимает.
