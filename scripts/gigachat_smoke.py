#!/usr/bin/env python3
"""Check GigaChat OAuth, model availability and one small completion without printing secrets."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings
from app.services.gigachat import GigaChatAPI, GigaChatAPIError, GigaChatRateLimitError


async def run() -> int:
    if os.getenv("JUDRIVE_LIVE_GIGACHAT") != "1":
        print("BLOCKED: живой запрос разрешается только через JUDRIVE_LIVE_GIGACHAT=1")
        return 2
    settings = get_settings()
    if not settings.gigachat_credentials:
        print("BLOCKED: GIGACHAT_CREDENTIALS отсутствует в локальном .env")
        return 2

    api = GigaChatAPI(
        settings.gigachat_credentials,
        scope=settings.gigachat_scope,
        base_url=settings.gigachat_base_url,
        auth_url=settings.gigachat_auth_url,
        timeout_s=settings.gigachat_timeout_s,
        ca_bundle=settings.gigachat_ca_bundle,
    )
    try:
        models_payload = await api.request_json("GET", "/v1/models")
        models = models_payload.get("data") or []
        model_ids = [str(item.get("id")) for item in models if isinstance(item, dict) and item.get("id")]
        print(f"OAuth: OK; доступных моделей: {len(model_ids)}")
        print("Модели:", ", ".join(model_ids[:30]) or "(список пуст)")
        if settings.gigachat_model not in model_ids:
            print(f"BLOCKED: настроенная модель {settings.gigachat_model!r} не найдена в GET /v1/models")
            print("Проверьте доступ к выбранной модели в кабинете GigaChat.")
            return 2

        result = await api.request_json(
            "POST",
            "/v1/chat/completions",
            json={
                "model": settings.gigachat_model,
                "messages": [{"role": "user", "content": "Ответь одним словом: OK"}],
                "max_tokens": 24,
                "temperature": 0,
            },
        )
        choices = result.get("choices") or []
        message = choices[0].get("message", {}) if choices else {}
        reply = str(message.get("content") or "").strip()
        usage = result.get("usage") or {}
        if not reply:
            print("FAIL: API ответил без текста")
            return 1
        print(f"Completion: OK; model={settings.gigachat_model}; reply={reply[:120]!r}")
        print(
            "Usage:",
            f"prompt={usage.get('prompt_tokens', 0)}",
            f"completion={usage.get('completion_tokens', 0)}",
            f"total={usage.get('total_tokens', 0)}",
        )
        return 0
    except GigaChatRateLimitError:
        print("FAIL: GigaChat вернул 429 rate limit. Повторите позже; ключ не выводится.")
        return 2
    except GigaChatAPIError as exc:
        print(f"FAIL: GigaChat HTTP {exc.status_code}")
        return 2
    except httpx.TimeoutException:
        print("FAIL: таймаут GigaChat. Проверьте сеть и доступность API.")
        return 2
    except httpx.HTTPError as exc:
        print(f"FAIL: транспортная ошибка {type(exc).__name__}; проверьте сеть/TLS/CA.")
        return 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
