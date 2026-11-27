"""Assert the synthetic Docker stack through the loopback Caddy endpoint."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
from statistics import median
from time import perf_counter
from urllib.parse import urlsplit

import httpx


def verify(base: str, record: Path, after_restart: bool) -> None:
    if urlsplit(base).hostname not in {"127.0.0.1", "::1"}:
        raise ValueError("This test only supports a disposable loopback deployment")
    pair = {"vehicle_id": "B418HK98", "session_id": "S-0009"}
    scope = {"engine_model": "ЯМЗ-236М2", **pair}
    with httpx.Client(base_url=base, trust_env=False, timeout=30) as api:
        assert api.get("/").status_code == 200
        readiness = api.get("/api/ready")
        assert readiness.status_code == 200
        assert readiness.json()["gigachat_agent"] == "ready"
        pdf = "/api/sources/pdf/y236-re"
        assert api.get(pdf, params=scope).status_code == 401
        assert api.get("/api/sources/evidence/y236-re:p0033", params=scope).status_code == 401
        assert api.post("/api/conversations", json=pair).status_code == 401
        demo = api.post("/api/auth/login", json={"username": "123", "password": "123"})
        assert demo.status_code == 200 and demo.json()["role"] == "demo"
        assert api.get("/api/vehicles").status_code == 200
        assert api.get(pdf, params=scope).status_code == 403
        assert api.get("/api/sources/evidence/y236-re:p0033", params=scope).status_code == 403
        assert api.post("/api/conversations", json=pair).status_code == 403
        assert api.post("/api/voice/transcribe").status_code == 403
        assert api.get("/api/tickets").status_code == 403
        assert api.post("/api/auth/logout").status_code == 200
        assert api.post("/api/auth/login", json={
            "username": "compose-test", "password": os.environ["TEST_CHIEF_PASSWORD"],
        }).status_code == 200
        assert api.get("/api/sources/pdf/z5234-rk", params=scope).status_code == 404
        ranged = api.get(pdf, params=scope, headers={"Range": "bytes=0-31"})
        assert ranged.status_code == 206 and ranged.content.startswith(b"%PDF-")
        assert api.post("/api/diagnose", json=pair).json()["status"] == "anomaly"
        if after_restart:
            saved = json.loads(record.read_text())
            assert len(api.get(saved["messages"]).json()["messages"]) == 2
            assert any(item["ticket_id"] == saved["ticket"] for item in api.get("/api/tickets").json()["tickets"])
            print("PASS: conversation and test ticket persisted after backend restart")
            return
        conversation = api.post("/api/conversations", json=pair).json()["conversation_id"]
        messages = f"/api/conversations/{conversation}/messages"
        draft = api.post(messages, json={
            "message": "Подготовить заявку по клапанному механизму с источниками", "action": "prepare_ticket",
        }).json()["draft"]
        assert any(ref["pdf_page"] in (33, 34) for ref in draft["payload"]["references"])
        confirm = api.post(f"/api/tickets/drafts/{draft['draft_id']}/confirm", json={
            "acknowledge": True, "confirm_nonce": draft["confirm_nonce"],
        }).json()
        assert confirm["status"] == "created"
        record.write_text(json.dumps({"messages": messages, "ticket": confirm["ticket_id"]}))

        def probe(_: int) -> float:
            started = perf_counter()
            assert api.get("/api/live").status_code == 200
            return (perf_counter() - started) * 1000

        with ThreadPoolExecutor(max_workers=8) as workers:
            latencies = sorted(workers.map(probe, range(80)))
        print(f"PASS: 80 local liveness requests at concurrency 8, "
              f"median {median(latencies):.1f} ms, p95 {latencies[75]:.1f} ms")
    print("PASS: Caddy, dependencies, authenticated PDF, diagnosis and synthetic ticket")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base")
    parser.add_argument("record", type=Path)
    parser.add_argument("--after-restart", action="store_true")
    args = parser.parse_args()
    verify(args.base, args.record, args.after_restart)
