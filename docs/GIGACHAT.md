# GigaChat API в JUDRIVE

JUDRIVE использует GigaChat как основной LLM-провайдер агента и для распознавания речи. Groq больше не нужен в рабочем контуре.

## 1. Получить Authorization Key

1. Откройте кабинет разработчика GigaChat API и выберите проект API.
2. В разделе настроек API создайте или скопируйте Authorization Key.
3. Это не короткоживущий access_token. Приложение само обменивает Authorization Key на Bearer-токен через OAuth.
4. Не отправляйте ключ в чат, не добавляйте его в Git, скриншоты, логи или публичные файлы.

В локальном .env задайте:

~~~dotenv
GIGACHAT_CREDENTIALS=ваш_authorization_key
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_MODEL=GigaChat-3-Ultra
GIGACHAT_STT_MODEL=GigaChat-3-Ultra
~~~

Если проект создан для ИП/юридического лица, используйте scope, который указан в кабинете проекта (например, GIGACHAT_API_B2B или GIGACHAT_API_CORP). Не угадывайте scope: он должен соответствовать типу проекта.

## 2. Модель

По умолчанию выбрана GigaChat-2-Max: она доступна физическим и юридическим лицам на платных тарифах, поддерживает пользовательские функции и анализ аудио. GigaChat-3-Ultra доступна только физлицам в freemium-режиме. Если выбранная модель не отображается в GET /v1/models, задайте доступную модель, например GigaChat-2-Pro или GigaChat-3-Ultra. LLM и STT-модель можно настроить отдельно.

~~~powershell
python scripts/gigachat_smoke.py
~~~

## 3. TLS и сертификаты

TLS-проверка включена и не отключается приложением. Если сервер не доверяет сертификатной цепочке GigaChat, установите актуальный корневой сертификат Минцифры в системное хранилище сертификатов либо укажите путь к CA bundle:

~~~dotenv
GIGACHAT_CA_BUNDLE=C:/certs/russian-trusted-ca.pem
~~~

Не используйте отключение проверки TLS как постоянное решение.

## 4. Что делает интеграция

- LLM: /v1/chat/completions, нативный functions + function_call=auto; инструменты JUDRIVE и серверные guardrails остаются прежними.
- OAuth: POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth; токен кешируется и обновляется до истечения срока.
- STT: аудиофайл загружается в приватное файловое хранилище GigaChat (purpose=general), передаётся как attachments, затем удаляется через /v1/files/{id}/delete.
- Голосовой endpoint требует активную сессию главного механика, ограничивает файл 8 МБ и принимает поддерживаемые GigaChat MIME-типы.
- Usage LLM и STT записывается в provider-neutral таблицы llm_usage и llm_usage_steps. Исторические записи Groq сохраняются.

## 5. Проверка

1. Добавьте ключ только в локальный .env.
2. Перезапустите backend.
3. Выполните python scripts/gigachat_smoke.py.
4. Проверьте реальное распознавание: python scripts/voice_smoke.py --audio path/to/voice.wav (скрипт попросит войти как главный механик). Без --audio проверяется только маршрут загрузки на короткой тихой записи.
5. Выполните python scripts/verify_agent_scenarios.py для C1–C3. Для тестовой отправки заявки используйте --confirm только на изолированном тестовом контуре.

Если smoke не проходит, передавайте только HTTP-статус и очищенное сообщение ошибки. Сам Authorization Key и Bearer access token не публикуйте.


## Стоимость модели

По опубликованной таблице моделей GigaChat 2 Max стоит 650 ₽ за 1 млн токенов, GigaChat 2 Pro — 500 ₽, GigaChat 2 Lite — 65 ₽ (тарифы и правила биллинга нужно перепроверить в кабинете перед запуском). Учитывайте, что голосовые аудиофайлы также обрабатываются моделью и могут расходовать токены.
