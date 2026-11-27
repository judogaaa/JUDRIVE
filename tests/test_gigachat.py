from __future__ import annotations

import asyncio
from copy import deepcopy
import io
import time
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.agent.gigachat_client import GigaChatAgentClient
from app.services import gigachat
from app.services.gigachat import GigaChatAPI, GigaChatAPIError, GigaChatRateLimitError
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
            self.requests.append(deepcopy(json))
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
                {"role": "system", "content": "Двигатель ЯМЗ-236"},
                {"role": "user", "content": "Найди норму теплового зазора"},
                {"role": "system", "content": "Отвечай по-русски"},
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
    assert api.requests[0]["functions"][0]["name"] == "search_manuals"
    assert "additionalProperties" not in api.requests[0]["functions"][0]["parameters"]
    assert "tools" not in api.requests[0]
    initial_messages = api.requests[0]["messages"]
    assert [item["role"] for item in initial_messages] == ["system", "user"]
    assert "Двигатель ЯМЗ-236" in initial_messages[0]["content"]
    assert "Отвечай по-русски" in initial_messages[0]["content"]
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


@pytest.fixture
def oauth_clock(monkeypatch):
    clock = SimpleNamespace(elapsed=0.0)
    monkeypatch.setattr(gigachat, "time", SimpleNamespace(
        time=lambda: 1_800_000_000 + clock.elapsed,
        monotonic=lambda: 350 + clock.elapsed,
    ))
    return clock


@pytest.mark.parametrize("expiration", ["milliseconds", "expires_in", "legacy_seconds"])
def test_refresh_before_expiration_is_shared(oauth_clock, expiration):
    issued = 0

    async def handler(request):
        nonlocal issued
        if request.url.path == "/api/v2/oauth":
            issued += 1
            await asyncio.sleep(0)
            payload = {"access_token": f"token-{issued}"}
            deadline = 1_800_000_000 + oauth_clock.elapsed + 120
            if expiration == "expires_in":
                payload["expires_in"] = 120
            else:
                payload["expires_at"] = int(deadline * (1000 if expiration == "milliseconds" else 1))
            return httpx.Response(200, json=payload)
        return httpx.Response(200, json={"token": request.headers["authorization"]})

    async def scenario():
        api = GigaChatAPI("test-only", transport=httpx.MockTransport(handler))
        async def fetch():
            return (await api.request_json("GET", "/v1/models"))["token"]

        assert await fetch() == "Bearer token-1"
        oauth_clock.elapsed = 59
        assert await fetch() == "Bearer token-1"
        oauth_clock.elapsed = 60
        tokens = await asyncio.gather(*(fetch() for _ in range(8)))
        assert tokens == ["Bearer token-2"] * 8

    asyncio.run(scenario())
    assert issued == 2


def test_concurrent_401_refreshes_once_and_retries_each_request():
    issued = 0
    rejected = 0
    retried = 0

    async def scenario():
        all_initial_requests = asyncio.Event()

        async def handler(request):
            nonlocal issued, rejected, retried
            if request.url.path == "/api/v2/oauth":
                issued += 1
                await asyncio.sleep(0)
                return httpx.Response(200, json={"access_token": f"token-{issued}", "expires_in": 600})
            if request.headers["authorization"] == "Bearer token-1":
                rejected += 1
                if rejected == 8:
                    all_initial_requests.set()
                await all_initial_requests.wait()
                return httpx.Response(401)
            assert request.headers["authorization"] == "Bearer token-2"
            retried += 1
            return httpx.Response(200, json={"data": []})

        api = GigaChatAPI("test-only", transport=httpx.MockTransport(handler))
        await asyncio.wait_for(asyncio.gather(*(
            api.request_json("GET", "/v1/models") for _ in range(8)
        )), timeout=5)

    asyncio.run(scenario())
    assert (issued, rejected, retried) == (2, 8, 8)


@pytest.mark.parametrize(("status", "error", "calls"), [
    (401, GigaChatAPIError, 2), (403, GigaChatAPIError, 1),
    (429, GigaChatRateLimitError, 1), (None, httpx.ReadTimeout, 1),
])
def test_provider_errors_do_not_retry_except_one_401(status, error, calls):
    api_calls = 0
    oauth_calls = 0

    async def handler(request):
        nonlocal api_calls, oauth_calls
        if request.url.path == "/api/v2/oauth":
            oauth_calls += 1
            return httpx.Response(200, json={"access_token": f"token-{oauth_calls}", "expires_in": 600})
        api_calls += 1
        if status is None:
            raise httpx.ReadTimeout("test timeout", request=request)
        return httpx.Response(status)

    api = GigaChatAPI("test-only", transport=httpx.MockTransport(handler))
    with pytest.raises(error) as exc:
        asyncio.run(api.request_json("POST", "/v1/chat/completions", json={}))
    if status is not None:
        assert exc.value.status_code == status
    assert api_calls == oauth_calls == calls


def test_expired_millisecond_token_is_never_sent(oauth_clock):
    async def handler(request):
        assert request.url.path == "/api/v2/oauth"
        return httpx.Response(200, json={"access_token": "stale", "expires_at": 1_799_999_999_999})

    api = GigaChatAPI("test-only", transport=httpx.MockTransport(handler))
    with pytest.raises(GigaChatAPIError, match="invalid expiration"):
        asyncio.run(api.request_json("GET", "/v1/models"))


def test_audio_http_upload_and_cleanup_after_completion_timeout():
    paths = []

    async def handler(request):
        paths.append(request.url.path)
        if request.url.path == "/api/v2/oauth":
            return httpx.Response(200, json={"access_token": "test", "expires_in": 600})
        assert request.headers["authorization"] == "Bearer test"
        if request.url.path == "/v1/files":
            data = await request.aread()
            assert b'name="purpose"' in data and b"general" in data
            assert b'filename="speech.webm"' in data
            assert b"Content-Type: audio/webm" in data and b"test-audio" in data
            return httpx.Response(200, json={"id": "uploaded"})
        if request.url.path == "/v1/chat/completions":
            assert b'"attachments":["uploaded"]' in await request.aread()
            raise httpx.ReadTimeout("test timeout", request=request)
        return httpx.Response(204)

    api = GigaChatAPI("test-only", transport=httpx.MockTransport(handler))
    service = VoiceService(api, "test-model", 1)
    upload = UploadFile(io.BytesIO(b"test-audio"), filename="speech.webm",
                        headers=Headers({"content-type": "audio/webm"}))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(service.transcribe(upload, language="ru"))
    assert exc.value.status_code == 504
    assert paths == ["/api/v2/oauth", "/v1/files", "/v1/chat/completions", "/v1/files/uploaded/delete"]


def test_schema_smoke_posts_exact_production_functions():
    from app.agent.gigachat_client import gigachat_functions
    from app.agent.tools import TOOL_DEFINITIONS
    from scripts.gigachat_smoke import validate_functions

    sent = []

    class API:
        async def request_json(self, method, path, *, json):
            assert (method, path) == ("POST", "/v1/functions/validate")
            sent.append(json)
            return {"status": 200, "warnings": []}

    assert asyncio.run(validate_functions(API())) == 0
    assert sent == gigachat_functions(TOOL_DEFINITIONS)
    assert len(sent) == 4


@pytest.mark.parametrize(("base", "allowed"), [
    ("http://127.0.0.1:8090", True), ("http://[::1]:8090", True),
    ("https://workshop.example", True), ("http://workshop.example", False),
    ("http://localhost.workshop.example", False), ("https://user@workshop.example", False),
])
def test_voice_smoke_checks_transport_before_credentials(monkeypatch, capsys, base, allowed):
    from scripts import voice_smoke

    def settings():
        assert allowed
        return SimpleNamespace(gigachat_credentials=None)

    monkeypatch.setattr(voice_smoke, "BASE", base)
    monkeypatch.setattr(voice_smoke, "get_settings", settings)
    monkeypatch.setattr("sys.argv", ["voice_smoke.py"])
    assert voice_smoke.main() == 2
    assert ("HTTPS" in capsys.readouterr().out) is not allowed


@pytest.mark.parametrize("arguments", ["{broken", [], None])
def test_malformed_function_arguments_never_reach_the_tool(arguments):
    class API:
        async def request_json(self, *args, **kwargs):
            return {"choices": [{"message": {"function_call": {
                "name": "get_diagnosis", "arguments": arguments,
            }}}]}

    async def unexpected_tool(*args):
        pytest.fail("Invalid arguments reached the tool")

    client = GigaChatAgentClient(API(), "test-model", max_tokens=64, timeout_s=1)
    with pytest.raises(GigaChatAPIError, match="invalid function arguments"):
        asyncio.run(client.run_with_tools([{"role": "user", "content": "Диагностика"}], [], unexpected_tool))
