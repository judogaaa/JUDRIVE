from __future__ import annotations

import asyncio
import io
import time

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.agent.gigachat_client import GigaChatAgentClient
from app.services.gigachat import GigaChatAPI
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
            return httpx.Response(200, json={"access_token": "test-token", "expires_at": int(time.time()) + 1800})
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
            [{"role": "user", "content": "Найди норму теплового зазора"}],
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
    assert api.requests[0]["functions"][0]["name"] == "search_manuals"
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
    upload = UploadFile(
        file=io.BytesIO(b"test-audio"),
        filename="speech.webm",
        headers=Headers({"content-type": "audio/webm;codecs=opus"}),
    )

    async def scenario():
        return await service.transcribe(upload, language="ru")

    result = asyncio.run(scenario())
    assert result == {"text": "Проверьте клапанный механизм.", "language": "ru"}
    assert api.upload == ("speech.webm", b"test-audio", "audio/webm")
    assert api.request["messages"][0]["attachments"] == ["audio-file-id"]
    assert api.request["function_call"] == "auto"
    assert api.deleted == ["audio-file-id"]
    assert usage and usage[0]["total_tokens"] == 27 and usage[0]["latency_ms"] >= 0


def test_gigachat_voice_rejects_unsupported_mime_before_upload():
    class FakeAPI:
        configured = True

        async def upload_file(self, *args, **kwargs):
            raise AssertionError("upload must not be called")

    service = VoiceService(FakeAPI(), "GigaChat-3-Ultra", 90)
    upload = UploadFile(
        file=io.BytesIO(b"test"),
        filename="test.bin",
        headers=Headers({"content-type": "application/octet-stream"}),
    )

    async def scenario():
        await service.transcribe(upload, language="ru")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scenario())
    assert exc.value.status_code == 415



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
