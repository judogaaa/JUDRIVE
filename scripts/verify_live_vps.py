"""Accept a disposable LIVE stack, without printing credentials, manuals or transcripts."""
import argparse
import asyncio
from contextlib import closing
from dataclasses import replace
import json
import os
from pathlib import Path
import re
import sqlite3
import sys

import httpx

from app.config import get_settings
from app.services.gigachat import GigaChatAPI, GigaChatAPIError
from verify_agent_scenarios import run_scenario
from voice_smoke import MIME_BY_SUFFIX

BASE = "http://127.0.0.1:8090"
ANOMALY = {"vehicle_id": "B418HK98", "session_id": "S-0009"}
EXPECTED = {"y236-re:p0031", "y236-rk:p0269", "y236-rk:p0276"}


def require(condition, label):
    if not condition:
        raise RuntimeError(label)
    print("PASS:", label, flush=True)


async def models():
    cfg = get_settings()
    api = GigaChatAPI(cfg.gigachat_credentials, scope=cfg.gigachat_scope, ca_bundle=cfg.gigachat_ca_bundle)
    initial = await api._get_access_token()
    api._access_token = replace(initial, refresh_at=0)
    data = await api.request_json("GET", "/v1/models")
    if api._access_token is None or api._access_token.refresh_at <= 0:
        raise RuntimeError("OAuth refresh did not leave a valid cached token")
    names = {item["id"] for item in data.get("data", []) if isinstance(item, dict) and isinstance(item.get("id"), str)}
    if cfg.gigachat_stt_model not in names:
        print("BLOCKED: configured Max STT model is not listed", file=sys.stderr)
    return next((model for model in ("GigaChat-3-Ultra", "GigaChat-2-Max") if model in names), "")


def usage_snapshot(path):
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as conn:
        return {stage: (int(count), int(tokens)) for stage, count, tokens in conn.execute(
            "SELECT stage, count(*), coalesce(sum(total_tokens),0) FROM llm_usage WHERE provider='gigachat' GROUP BY stage"
        )}


async def run(args):
    login = json.load(sys.stdin)
    async with httpx.AsyncClient(base_url=BASE, trust_env=False, follow_redirects=False, timeout=120) as api:
        pdf = "/api/sources/pdf/y236-re"
        scope = {"engine_model": "ЯМЗ-236М2", **ANOMALY}
        status = await api.get(pdf, params=scope)
        require(status.status_code == 401, "anonymous PDF")
        auth = await api.post("/api/auth/login", json={"username": "123", "password": "123"})
        require(auth.is_success and auth.json()["role"] == "demo", "public account only issues demo role")
        checks = (("GET", pdf), ("GET", "/api/sources/evidence/y236-re:p0031"),
                  ("POST", "/api/manuals/search"), ("POST", "/api/conversations"),
                  ("POST", "/api/voice/transcribe"), ("GET", "/api/tickets"),
                  ("GET", "/api/fleet/dashboard"))
        for method, endpoint in checks:
            response = await api.request(method, endpoint, params=scope, json={} if method == "POST" else None)
            require(response.status_code == 403, f"demo denied {method} {endpoint}")
        await api.post("/api/auth/logout")
        auth = await api.post("/api/auth/login", json=login)
        require(auth.is_success and auth.json()["role"] == "chief", "private mechanic session")
        require((await api.get("/api/ready")).status_code == 200, "provider and originals readiness")
        response = await api.get(pdf, params=scope, headers={"Range": "bytes=0-4"})
        require(response.status_code == 206 and response.content == b"%PDF-", "authorized original PDF")
        require((await api.get("/api/sources/pdf/z5234-rk", params=scope)).status_code == 404,
                "wrong engine document rejected")
        response = await api.post("/api/manuals/search", json={**scope, "query": "регулировка тепловых зазоров клапанов"})
        rag = response.json()
        require(response.is_success and rag["status"] == "potential_conflict" and
                {s["evidence_id"] for s in rag["conflicting_sources"]} == EXPECTED and
                "сама по себе не подтверждает охлаждение" in rag["message"] and
                "менее 15" in rag["message"] and
                "не ранее 15" in rag["message"] and
                any("ЯМЗ-238КМ2" in (s.get("applicability") or "") for s in rag["conflicting_sources"]),
                "original potential conflict RE 31 / RK 269 / RK 276")

        for label, pair, status, prompt in (
            ("normal", ("M333YK47", "S-0006"), "normal", "Объясни результат диагностики и скажи, нужна ли заявка."),
            ("C2 перегон", ("B418HK98", "S-0009"), "anomaly", "Можно ли своим ходом перегнать машину на базу?"),
            ("C3 bad", ("P456AT178", "S-0003"), "check_failed", "Запись непригодна. Можно ли оформить заявку?"),
        ):
            result = await run_scenario(api, label=label, vehicle_id=pair[0], session_id=pair[1],
                                        expected_status=status, user_message=prompt, expect_draft=False, try_confirm=False)
            require(result.ok, label)
        diagnosis = await api.post("/api/diagnose", json=ANOMALY)
        require(diagnosis.is_success and diagnosis.json()["status"] == "anomaly", "fresh anomaly from Mock ML")
        conv = await api.post("/api/conversations", json=ANOMALY)
        require(conv.is_success, "isolated conversation")
        cid = conv.json()["conversation_id"]
        messages = f"/api/conversations/{cid}/messages"
        answer = await api.post(messages, json={"locale": "ru", "action": "prepare_ticket",
            "message": "Найди применимую процедуру проверки тепловых зазоров клапанного механизма. Подготовь черновик заявки с источниками."})
        require(answer.is_success, "native agent response")
        body = answer.json()
        tools = {row["tool"] for row in body.get("tool_trace", [])}
        require({"search_manuals", "prepare_defect_ticket"} <= tools and body.get("usage", {}).get("total_tokens", 0) > 0,
                "native Function Calling with RAG, ticket tool and provider usage")
        draft = body.get("draft") or {}
        refs = draft.get("payload", {}).get("references", [])
        require(draft.get("draft_id") and draft.get("confirm_nonce") and refs and
                any(ref["manual"] == "236-3902150-Б РЭ" and ref["pdf_page"] in {33, 34} for ref in refs),
                "grounded draft cites an applicable procedure")
        if args.confirm:
            if os.environ.get("MOCK_TOIR_URL") != "http://toir:8002" or os.environ.get("DB_PATH") != "/app/local-data/judrive.sqlite":
                raise RuntimeError("confirmation requires the isolated Mock TOiR configuration")
            response = await api.post(f"/api/tickets/drafts/{draft['draft_id']}/confirm",
                                      json={"acknowledge": True, "confirm_nonce": draft["confirm_nonce"]})
            entry = response.json()
            tid = entry.get("ticket_id")
            require(response.is_success and entry["status"] == "created" and isinstance(tid, str)
                    and re.fullmatch(r"TKT-[0-9]+", tid), "confirmed through Mock TOiR")
            journal = await api.get("/api/tickets", params={"vehicle_id": ANOMALY["vehicle_id"]})
            require(journal.is_success and any(item["ticket_id"] == tid for item in journal.json()["tickets"]),
                    f"ticket {tid} in journal")
        else:
            print("BLOCKED: ticket submission requires -ConfirmMock", flush=True)
        history = await api.get("/api/vehicles/B418HK98/diagnosis-history")
        require(history.is_success and any(row["session_id"] == ANOMALY["session_id"]
                                           for row in history.json()["trend_points"]), "vehicle history")
        chat = await api.get(messages)
        require(chat.is_success and len(chat.json()["messages"]) >= 2, "conversation history")
        if args.audio:
            audio = Path(args.audio)
            with audio.open("rb") as stream:
                response = await api.post("/api/voice/transcribe", data={"locale": "ru"},
                    files={"file": (audio.name, stream, MIME_BY_SUFFIX[audio.suffix.lower()])})
            require(response.is_success, "live Russian speech request")
            text = response.json().get("text", "").casefold()
            require("проверк" in text and "двигател" in text, "Russian transcript matches the reference phrase")
        else:
            print("BLOCKED: Russian speech fixture not supplied", flush=True)
        await api.post("/api/auth/logout")
    return bool(args.confirm and args.audio)


def print_usage(path, before):
    after = usage_snapshot(path)
    for stage, (rows, tokens) in after.items():
        prior_rows, prior_tokens = before.get(stage, (0, 0))
        if rows > prior_rows:
            print(f"USAGE: {stage} calls={rows - prior_rows} total_tokens={tokens - prior_tokens}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", action="store_true")
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--audio")
    args = parser.parse_args()
    if os.environ.get("JUDRIVE_LIVE_GIGACHAT") != "1":
        print("BLOCKED: LIVE mode is required")
        return 2
    try:
        if args.model:
            print(await models())
        else:
            path = get_settings().db_path
            before = usage_snapshot(path)
            try:
                complete = await run(args)
            finally:
                print_usage(path, before)
            if not complete:
                return 2
        return 0
    except GigaChatAPIError as exc:
        print(f"FAIL: GigaChat HTTP {exc.status_code}", file=sys.stderr)
    except RuntimeError as exc:
        print("FAIL:", str(exc), file=sys.stderr)
    except (httpx.HTTPError, KeyError, TypeError, ValueError, OSError) as exc:
        print(f"FAIL: {type(exc).__name__}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
