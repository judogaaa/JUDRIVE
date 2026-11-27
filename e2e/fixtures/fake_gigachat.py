"""Deterministic GigaChat-native function-calling stub for isolated ticket E2E."""
from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import FastAPI, Request

app = FastAPI(title="JUDRIVE fake GigaChat for isolated E2E")
LOG = Path(__file__).resolve().parents[2] / "local-data" / "fake_gigachat.log"


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


@app.post("/api/v2/oauth")
async def oauth(_: Request) -> dict:
    return {"access_token": "e2e-access-token", "expires_at": int(time.time()) + 1800}


@app.post("/v1/chat/completions")
async def chat(request: Request) -> dict:
    body = await request.json()
    messages = body.get("messages") or []
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
