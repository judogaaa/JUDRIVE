"""Deterministic GigaChat-native function-calling stub for isolated ticket E2E."""
from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile

app = FastAPI(title="JUDRIVE fake GigaChat for isolated E2E")
LOG = Path.cwd() / "local-data" / "fake_gigachat.log"
_retry_requested = False


def _log(payload: dict) -> None:
    try:
        with LOG.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except OSError:
        pass


SCENARIOS = {
    "S-0009": {
        "query": "тепловые зазоры клапанного механизма",
        "pages": [33, 34],
        "doc_id": "y236-re",
        "operations": ["Проверить тепловые зазоры клапанного механизма по руководству"],
        "spare_parts": [],
    },
    "S-0008": {
        "query": "зазор клапанного механизма регулировка",
        "pages": [255, 34],
        "operations": ["Проверить зазоры клапанного механизма"],
        "spare_parts": [],
    },
    "S-0011": {
        "query": "масляный насос редукционный клапан",
        "pages": [7, 8],
        "operations": [
            "Проверить систему смазки двигателя",
            "Проверить давление открытия редукционного клапана масляного насоса",
        ],
        "spare_parts": ["редукционный клапан масляного насоса"],
    },
}
DEFAULT_SCENARIO = {"query": "общий осмотр двигателя", "pages": [], "operations": [], "spare_parts": []}


def _completion(message: dict, finish: str) -> dict:
    return {
        "id": "gigachat-e2e",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "e2e-function-stub",
        "choices": [{"index": 0, "message": message, "finish_reason": finish}],
        "usage": {"prompt_tokens": 40, "completion_tokens": 20, "total_tokens": 60},
    }


def _function_call(name: str, arguments: dict) -> dict:
    return {
        "role": "assistant",
        "content": "",
        "functions_state_id": "e2e-state",
        "function_call": {"name": name, "arguments": arguments},
    }


def _scenario(messages: list[dict]) -> tuple[str, dict]:
    serialized = json.dumps(messages, ensure_ascii=False)
    for session_id, scenario in SCENARIOS.items():
        if f"session_id={session_id}" in serialized:
            return session_id, scenario
    return "", DEFAULT_SCENARIO


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def authorize(request: Request) -> None:
    if request.headers.get("Authorization") != "Bearer e2e-access-token":
        raise HTTPException(401)


@app.post("/api/v2/oauth")
async def oauth(request: Request, scope: str = Form(...)) -> dict:
    if request.headers.get("Authorization") != "Basic e2e-test-authorization-key":
        raise HTTPException(401)
    if not request.headers.get("RqUID") or scope != "GIGACHAT_API_PERS":
        raise HTTPException(422)
    return {"access_token": "e2e-access-token", "expires_at": int((time.time() + 1800) * 1000)}


@app.get("/v1/models")
def models(request: Request) -> dict:
    authorize(request)
    return {"data": [{"id": "e2e-function-stub"}]}


@app.post("/v1/files")
async def upload(request: Request, purpose: str = Form(...), file: UploadFile = File(...)) -> dict:
    authorize(request)
    data = await file.read()
    if purpose != "general" or file.content_type != "audio/wav" or not data.startswith(b"RIFF"):
        raise HTTPException(422)
    return {"id": "isolated-wav"}


@app.post("/v1/files/isolated-wav/delete")
def delete(request: Request) -> dict:
    authorize(request)
    return {"deleted": True}


@app.post("/v1/chat/completions")
async def chat(request: Request) -> dict:
    global _retry_requested
    authorize(request)
    body = await request.json()
    messages = body.get("messages") or []
    if body.get("model") != "e2e-function-stub" or not messages:
        raise HTTPException(422)
    if messages[-1].get("attachments") == ["isolated-wav"]:
        return _completion({"role": "assistant", "content": "Проверьте клапанный механизм."}, "stop")
    if messages[0].get("role") != "system" or any(item.get("role") == "system" for item in messages[1:]):
        raise HTTPException(422, "Only a leading system message is permitted")
    if any(item.get("function_call") and item.get("functions_state_id") != "e2e-state" for item in messages):
        raise HTTPException(422, "Missing function state")
    if messages[-1].get("content") == "Проверь запись и источники":
        if not _retry_requested:
            _retry_requested = True
            raise HTTPException(503, "Simulated provider outage")
        _retry_requested = False
        return _completion({"role": "assistant", "content":
            "**Вывод:**\n- повторить запись при помехах\n1. сверить данные сессии"}, "stop")

    session_id, scenario = _scenario(messages)
    function_messages = []
    for message in messages:
        if message.get("role") != "function":
            continue
        try:
            function_messages.append(json.loads(message.get("content") or "{}"))
        except json.JSONDecodeError:
            continue
    _log({
        "session": session_id,
        "roles": [message.get("role") for message in messages],
        "functions": [message.get("name") for message in messages if message.get("role") == "function"],
        "function_keys": [list(item.keys()) for item in function_messages if isinstance(item, dict)],
    })

    if any(isinstance(item, dict) and item.get("draft_id") for item in function_messages):
        ids = [
            hit.get("evidence_id")
            for item in function_messages
            for hit in (item.get("results") or [])
            if isinstance(hit, dict)
        ][:3]
        return _completion(
            {
                "role": "assistant",
                "content": (
                    "Черновик заявки подготовлен по подтверждённым источникам "
                    + ", ".join(str(item) for item in ids)
                    + ". Проверьте работы и подтвердите отправку вручную."
                ),
            },
            "stop",
        )

    search_results = [
        item for item in function_messages if isinstance(item, dict) and isinstance(item.get("results"), list)
    ]
    if search_results:
        results = search_results[-1]["results"]
        preferred = [
            hit for hit in results
            if hit.get("pdf_page") in scenario["pages"]
            and (not scenario.get("doc_id") or hit.get("doc_id") == scenario["doc_id"])
        ]
        chosen = preferred or results[:2]
        evidence_ids = [hit["evidence_id"] for hit in chosen]
        operations = scenario["operations"] or [
            (chosen[0].get("quote") or "Проверить двигатель")[:120].strip() or "Проверить двигатель"
        ]
        arguments = {
            "conclusion": "Возможное отклонение подтверждается источниками. Требуется проверка специалистом.",
            "urgency": "medium",
            "operations": operations,
            "spare_parts": scenario["spare_parts"],
            "evidence_ids": evidence_ids,
        }
        _log({"action": "prepare", "evidence_ids": evidence_ids, "operations": operations})
        return _completion(_function_call("prepare_defect_ticket", arguments), "function_call")

    _log({"action": "search", "query": scenario["query"]})
    return _completion(
        _function_call("search_manuals", {"query": scenario["query"]}),
        "function_call",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8004, log_level="warning")
