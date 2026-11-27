#!/usr/bin/env python3
"""Check GigaChat OAuth, model availability and one small completion without printing secrets."""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.agent.gigachat_client import gigachat_functions
from app.agent.tools import TOOL_DEFINITIONS
from app.config import get_settings
from app.services.gigachat import GigaChatAPI, GigaChatAPIError, GigaChatRateLimitError


async def validate_functions(api: GigaChatAPI) -> int:
    failures = 0
    for function in gigachat_functions(TOOL_DEFINITIONS):
        name = function["name"]
        try:
            result = await api.request_json("POST", "/v1/functions/validate", json=function)
        except GigaChatAPIError as exc:
            print(f"FAIL: {name}, HTTP {exc.status_code}")
            failures += 1
            continue
        warnings = result.get("warnings") or []
        if result.get("status") != 200 or result.get("errors") or not isinstance(warnings, list):
            print(f"FAIL: {name}, invalid schema or unexpected validation response")
            failures += 1
        else:
            print(f"PASS: {name}, warnings={len(warnings)}")
    return 1 if failures else 0


async def run(*, validate_only: bool = False) -> int:
    if os.getenv("JUDRIVE_LIVE_GIGACHAT") != "1":
        print("BLOCKED: укажите JUDRIVE_LIVE_GIGACHAT=1 для живой проверки")
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
        if validate_only:
            return await validate_functions(api)
        models_payload = await api.request_json("GET", "/v1/models")
        models = models_payload.get("data") or []
        model_ids = [str(item.get("id")) for item in models if isinstance(item, dict) and item.get("id")]
        print(f"OAuth: OK; доступных моделей: {len(model_ids)}")
        print("Модели:", ", ".join(model_ids[:30]) or "(список пуст)")
        if settings.gigachat_model not in model_ids:
            print(f"BLOCKED: настроенная модель {settings.gigachat_model!r} не найдена в GET /v1/models")
            print("Измените GIGACHAT_MODEL на один из идентификаторов выше.")
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
        print(f"Completion: OK; model={settings.gigachat_model}")
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-functions", action="store_true",
                        help="Validate the production tool schemas without generating a completion")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(validate_only=args.validate_functions)))
