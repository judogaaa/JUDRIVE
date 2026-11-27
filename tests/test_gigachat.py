from __future__ import annotations

import asyncio
import io
import time
import wave

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.agent.gigachat_client import GigaChatAgentClient
from app.config import Settings
from app.services.gigachat import GigaChatAPI, GigaChatAPIError
from app.services.usage_budget import BudgetExceeded, UsageBudget
from app.services.voice import VoiceService
from app.storage.repository import AppRepository


def test_gigachat_oauth_token_is_cached_and_scope_is_sent():
    oauth_calls = 0
    api_calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal oauth_calls, api_calls
        if request.url.path == "/api/v2/oauth":
            oauth_calls += 1
            assert request.headers["authorization"] == "Basic test-authorization-key"
            assert request.headers["rqUID"]
            assert b"scope=GIGACHAT_API_PERS" in await request.aread()
            return httpx.Response(200, json={"access_token": "test-token", "expires_at": int((time.time() + 1800) * 1000)})
        if request.url.path == "/v1/models":
            api_calls += 1
            assert request.headers["authorization"] == "Bearer test-token"
            return httpx.Response(200, json={"data": [{"id": "GigaChat-3-Ultra"}]})
        return httpx.Response(404, json={"message": "unexpected path"})

    async def scenario():
        api = GigaChatAPI(
            "test-authorization-key",
            base_url="https://unit.test",
            auth_url="https://unit.test/api/v2/oauth",
            transport=httpx.MockTransport(handler),
        )
        first = await api.request_json("GET", "/v1/models")
        second = await api.request_json("GET", "/v1/models")
        assert first["data"][0]["id"] == "GigaChat-3-Ultra"
        assert second == first

    asyncio.run(scenario())
    assert oauth_calls == 1
    assert api_calls == 2


def test_gigachat_agent_uses_native_function_call_protocol():
    class FakeAPI:
        def __init__(self):
            self.requests = []
            self.responses = [
                {
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "functions_state_id": "state-1",
                            "function_call": {
                                "name": "search_manuals",
                                "arguments": {"query": "тепловые зазоры"},
                            },
                        },
                        "finish_reason": "function_call",
                    }],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12},
                },
                {
                    "choices": [{
                        "message": {"role": "assistant", "content": "Проверьте по руководству [y236-re:p0033]."},
                        "finish_reason": "stop",
                    }],
                    "usage": {"prompt_tokens": 14, "completion_tokens": 5, "total_tokens": 19},
                },
            ]

        async def request_json(self, method, path, *, json, timeout_s=None):
            self.requests.append(json)
            return self.responses.pop(0)

    api = FakeAPI()
    seen = []
    client = GigaChatAgentClient(api, "GigaChat-3-Ultra", max_tokens=1200, timeout_s=30)

    async def execute(name, arguments):
        seen.append((name, arguments))
        return {"results": [{"evidence_id": "y236-re:p0033"}]}

    async def scenario():
        return await client.run_with_tools(
            [
                {"role": "user", "content": "Более ранний вопрос"},
                {"role": "assistant", "content": "Более ранний ответ"},
                {"role": "system", "content": "Модель двигателя"},
                {"role": "user", "content": "Найди норму теплового зазора"},
                {"role": "system", "content": "Язык ответа"},
            ],
            [{
                "type": "function",
                "function": {
                    "name": "search_manuals",
                    "description": "Поиск по руководству",
                    "parameters": {
                        "type": "object",
                        "properties": {"query": {"type": "string"}},
                        "required": ["query"],
                        "additionalProperties": False,
                    },
                },
            }],
            execute,
            max_steps=4,
        )

    reply, trace, usage = asyncio.run(scenario())
    assert "y236-re:p0033" in reply
    assert seen == [("search_manuals", {"query": "тепловые зазоры"})]
    assert trace[0]["tool"] == "search_manuals"
    assert api.requests[0]["function_call"] == "auto"
    initial = api.requests[0]["messages"][:4]
    assert [item["role"] for item in initial] == ["system", "user", "assistant", "user"]
    assert "Модель двигателя" in initial[0]["content"] and "Язык ответа" in initial[0]["content"]
    assert api.requests[0]["functions"][0]["name"] == "search_manuals"
    assert "additionalProperties" not in api.requests[0]["functions"][0]["parameters"]
    assert "tools" not in api.requests[0]
    second_messages = api.requests[1]["messages"]
    assert second_messages[-2]["role"] == "assistant"
    assert second_messages[-2]["functions_state_id"] == "state-1"
    assert second_messages[-1]["role"] == "function"
    assert second_messages[-1]["name"] == "search_manuals"
    assert usage["total_tokens"] == 31


def test_gigachat_voice_uploads_attaches_and_deletes_file():
    class FakeAPI:
        configured = True

        def __init__(self):
            self.upload = None
            self.request = None
            self.deleted = []

        async def upload_file(self, filename, content, mime_type, *, timeout_s=None):
            self.upload = (filename, content, mime_type)
            return {"id": "audio-file-id"}

        async def request_json(self, method, path, *, timeout_s=None, **kwargs):
            self.request = kwargs["json"]
            return {
                "choices": [{"message": {"content": "Проверьте клапанный механизм."}}],
                "usage": {"prompt_tokens": 20, "completion_tokens": 7, "total_tokens": 27},
            }

        async def delete_file(self, file_id, *, timeout_s=None):
            self.deleted.append(file_id)

    api = FakeAPI()
    usage = []
    service = VoiceService(api, "GigaChat-3-Ultra", 90, on_usage=usage.append)
    audio = io.BytesIO()
    with wave.open(audio, "wb") as wav:
        wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        wav.writeframes(b"\x00\x00" * 800)
    audio.seek(0)
    upload = UploadFile(file=audio, filename="ignored-name.wav", headers=Headers({"content-type": "audio/wav"}))

    async def scenario():
        return await service.transcribe(upload, language="ru")

    result = asyncio.run(scenario())
    assert result == {"text": "Проверьте клапанный механизм.", "language": "ru"}
    assert api.upload == ("speech.wav", audio.getvalue(), "audio/wav")
    assert api.request["messages"][0]["attachments"] == ["audio-file-id"]
    assert api.request["function_call"] == "auto"
    assert api.deleted == ["audio-file-id"]
    assert usage and usage[0]["total_tokens"] == 27 and usage[0]["latency_ms"] >= 0


@pytest.mark.parametrize(("mime", "body", "status"), [
    ("application/octet-stream", b"test", 415),
    ("audio/wav", b"corrupt audio", 422),
    ("audio/wav", b"", 400),
    ("audio/webm", b"\0" * (8 * 1024 * 1024 + 1), 413),
])
def test_gigachat_voice_rejects_invalid_upload_before_provider(mime, body, status):
    class FakeAPI:
        configured = True

        async def upload_file(self, *args, **kwargs):
            raise AssertionError("upload must not be called")

    service = VoiceService(FakeAPI(), "GigaChat-3-Ultra", 90)
    upload = UploadFile(
        file=io.BytesIO(body),
        filename="test.bin",
        headers=Headers({"content-type": mime}),
    )

    async def scenario():
        await service.transcribe(upload, language="ru")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scenario())
    assert exc.value.status_code == status



def test_usage_migrates_legacy_groq_rows_and_logs_gigachat(tmp_path):
    db_path = tmp_path / "usage.sqlite"
    repository = AppRepository(db_path)
    with repository._connection() as conn:
        conn.execute(
            """
            INSERT INTO groq_usage
            (conversation_id, prompt_tokens, completion_tokens, total_tokens, latency_ms, created_at)
            VALUES (NULL, 3, 2, 5, 120, '2026-11-26T00:00:00+00:00')
            """
        )
        conn.execute(
            """
            INSERT INTO groq_usage_steps
            (conversation_id, stage, prompt_tokens, completion_tokens, total_tokens, created_at)
            VALUES ('legacy-conversation', 'answer', 3, 2, 5, '2026-11-26T00:00:00+00:00')
            """
        )

    repository = AppRepository(db_path)
    with repository._connection() as conn:
        old_total = conn.execute(
            "SELECT provider, stage, total_tokens FROM llm_usage WHERE provider='groq'"
        ).fetchone()
        old_step = conn.execute(
            "SELECT provider, stage, total_tokens FROM llm_usage_steps WHERE provider='groq'"
        ).fetchone()
    assert tuple(old_total) == ("groq", "agent_total", 5)
    assert tuple(old_step) == ("groq", "answer", 5)

    repository.log_usage(None, 7, 3, 10, 250, provider="gigachat", stage="voice_stt")
    with repository._connection() as conn:
        new_row = conn.execute(
            "SELECT provider, stage, total_tokens FROM llm_usage WHERE provider='gigachat'"
        ).fetchone()
    assert tuple(new_row) == ("gigachat", "voice_stt", 10)


def test_expired_oauth_and_rejected_token_are_refreshed():
    issued = 0
    bearer_tokens = []

    async def handler(request):
        nonlocal issued
        if request.url.path == "/api/v2/oauth":
            issued += 1
            ttl = -10 if issued == 1 else 1800
            return httpx.Response(200, json={
                "access_token": f"token-{issued}",
                "expires_at": int((time.time() + ttl) * 1000),
            })
        token = request.headers["authorization"]
        bearer_tokens.append(token)
        return httpx.Response(401 if token == "Bearer token-2" else 200, json={"data": []})

    async def scenario():
        api = GigaChatAPI("test-only", transport=httpx.MockTransport(handler))
        with pytest.raises(GigaChatAPIError, match="expired token"):
            await api.request_json("GET", "/v1/models")
        assert not bearer_tokens
        await api.request_json("GET", "/v1/models")
        await api.request_json("GET", "/v1/models")

    asyncio.run(scenario())
    assert issued == 3
    assert bearer_tokens == ["Bearer token-2", "Bearer token-3", "Bearer token-3"]


@pytest.mark.parametrize("limit", ["request", "daily", "monthly"])
def test_budget_blocks_a_second_billable_operation(tmp_path, limit):
    payload = {"model": "unit-model", "messages": [{"role": "user", "content": "test"}], "max_tokens": 20}
    settings = Settings(_env_file=None, db_path=tmp_path / "budget.sqlite",
                        gigachat_chat_microrub_per_token=100, **{f"gigachat_{limit}_budget_microrub": 80_000})
    budget = UsageBudget(settings)
    calls = []

    async def handler(request):
        if request.url.path == "/api/v2/oauth":
            return httpx.Response(200, json={"access_token": "safe", "expires_in": 600})
        calls.append(request.url.path)
        return httpx.Response(200, json={"usage": {"total_tokens": 590}})

    async def scenario():
        api = GigaChatAPI("test-only", transport=httpx.MockTransport(handler), budget=budget)
        with api.budget_scope():
            await api.request_json("POST", "/v1/chat/completions", json=payload)
            with pytest.raises(BudgetExceeded):
                await api.request_json("POST", "/v1/chat/completions", json=payload)

    asyncio.run(scenario())
    assert calls == ["/v1/chat/completions"]
    with budget.request():
        if limit == "request":
            assert budget.reserve(payload)
        else:
            with pytest.raises(BudgetExceeded):
                budget.reserve(payload)


def test_liveness_and_readiness_distinguish_unavailable_model(monkeypatch, auth_client, synthetic_rag):
    from app import main

    async def healthy():
        return True

    monkeypatch.setattr(main.mock_ml, "health", healthy)
    monkeypatch.setattr(main.mock_toir, "health", healthy)
    synthetic_rag.ensure_index()
    monkeypatch.setattr(main, "rag_service", synthetic_rag)

    class Provider:
        configured = True
        calls = 0

        async def request_json(self, method, path, **kwargs):
            self.calls += 1
            assert (method, path) == ("GET", "/v1/models")
            return {"data": [{"id": "GigaChat-2-Max"}]}

    provider = Provider()
    monkeypatch.setattr(main, "gigachat_api", provider)
    assert auth_client.get("/api/live").status_code == 200
    assert provider.calls == 0
    response = auth_client.get("/api/ready")
    assert response.status_code == 503
    assert response.json()["gigachat_agent"] == "unavailable"
    assert auth_client.get("/api/health").json()["status"] == "degraded"
    assert provider.calls == 1
