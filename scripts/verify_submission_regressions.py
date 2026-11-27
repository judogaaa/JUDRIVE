#!/usr/bin/env python3
"""Real vendor ASGI routes, real PDFs, isolated SQLite; no external LLM API or provider spending."""
from __future__ import annotations

import asyncio
import collections
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "vendor/neurodvs_mock")]
from app.auth.chief_session import hash_password
from app.config import get_settings
from app.agent.guardrails import sanitize_ml_observation, ml_facts_for_agent
from app.agent.tools import ToolRuntime
from app.agent.evidence import quantities_supported
from app.services.mock_clients import MockMlClient, MockToirClient
from app.services.tickets import TicketService
from mock_ml.app import app as ml
from mock_toir.app import app as toir


class Dispatch(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request):
        if request.url.port == 8001:
            target = ml
        elif request.url.port == 8002:
            target = toir
        else:
            raise AssertionError("Unexpected network request in deterministic test")
        return await httpx.ASGITransport(app=target).handle_async_request(request)


def check(label, condition):
    assert condition, label
    print("[OK]", label, flush=True)


def main():
    original_settings = get_settings()
    with tempfile.TemporaryDirectory(prefix="judrive-submission-", ignore_cleanup_errors=True) as tmp:
        os.environ.update(DB_PATH=str(Path(tmp) / "test.sqlite"), PDF_DIR=str(original_settings.pdf_dir),
                          MOCK_ML_URL="http://mock:8001", MOCK_TOIR_URL="http://mock:8002",
                          CHIEF_USERNAME="test-chief", CHIEF_PASSWORD_HASH=hash_password("temporary-test-only", "test-salt"),
                          SESSION_SECRET="test-only-session-secret", COOKIE_SECURE="false", GIGACHAT_CREDENTIALS="")
        get_settings.cache_clear()
        from app import main as backend
        original = httpx.AsyncClient
        httpx.AsyncClient = lambda *a, **kw: original(*a, **{**kw, "transport": Dispatch()})
        try:
            with TestClient(backend.app) as client:
                raw = json.loads(get_settings().fleet_data_path.read_text(encoding="utf-8"))["vehicles"]
                counts = collections.Counter()
                filtered = 0
                for vehicle in raw:
                    for session in vehicle["sessions"]:
                        response = client.post("/api/diagnose", json={"vehicle_id": vehicle["vehicle_id"], "session_id": session["session_id"]})
                        assert response.status_code == 200
                        d = response.json()
                        assert all(d[k] == session[k] for k in ("status", "anomaly_type", "anomaly_score", "confidence", "signal_quality", "model_version"))
                        assert d["description"] == sanitize_ml_observation(session["description"])
                        filtered += int(d["description"] != session["description"])
                        counts[d["status"]] += 1
                check("all 195 diagnoses, original structured facts", counts == {"normal": 111, "anomaly": 69, "check_failed": 15})
                check("all three description injections removed", filtered == 3)
                check("wrong pair rejected", client.post("/api/diagnose", json={"vehicle_id": "P456AT178", "session_id": "S-0009"}).status_code == 404)
                hist = client.get("/api/vehicles/B418HK98/diagnosis-history").json()["trend_points"]
                check("B418 actual history", [p["anomaly_score"] for p in hist] == [0.33, 0.67, 0.9])
                assert client.get("/api/fleet/dashboard").status_code == 401
                endpoint = "/api/fleet/vehicles/B418HK98/quarantine-recommendation"
                recommendation = {"session_id": "S-0009", "active": True, "reason": "Test manual recommendation; synthetic data only", "acknowledge": True}
                check("chief write unauthorized", client.post(endpoint, json=recommendation).status_code == 401)
                check("wrong password rejected", client.post("/api/auth/login", json={"username": "test-chief", "password": "wrong"}).status_code == 401)
                logged = client.post("/api/auth/login", json={"username": "test-chief", "password": "temporary-test-only"})
                check("chief authenticated with HttpOnly cookie", logged.status_code == 200 and "HttpOnly" in logged.headers["set-cookie"])
                dashboard = client.get("/api/fleet/dashboard").json()
                check("no automatic quarantine", sum(dashboard["summary"].values()) == 50 and dashboard["summary"]["quarantine"] == 0)
                check("chief explicit confirmation required", client.post(endpoint, json={**recommendation, "acknowledge": False}).status_code == 400)
                check("chief stale pair refused", client.post(endpoint, json={**recommendation, "session_id": "S-0008"}).status_code == 409)
                check("chief recommendation saved", client.post(endpoint, json=recommendation).json()["vehicle"]["category"] == "quarantine")
                recommended = client.get("/api/fleet/vehicles/B418HK98/insight").json()["vehicle"]
                check("recommendation is flagged as recommendation", recommended["quarantine_recommended"] is True)
                check("recommendation is not an operational quarantine", recommended["quarantine_confirmed"] is False)
                check("recommendation tied to exact latest session",
                      backend.app_repo.quarantine_recommendation("B418HK98", "S-0008") is None)
                check("dashboard uses recommendation", client.get("/api/fleet/dashboard").json()["summary"]["quarantine"] == 1)
                check("chief cancellation does not mark as normal", client.post(endpoint, json={**recommendation, "active": False}).json()["vehicle"]["category"] == "attention")
                cancelled = client.get("/api/fleet/vehicles/B418HK98/insight").json()["vehicle"]
                check("cancelled recommendation is not active", cancelled["quarantine_recommended"] is False)
                check("cancelled recommendation is not operational", cancelled["quarantine_confirmed"] is False)
                check("chief logout", client.post("/api/auth/logout").status_code == 200 and client.get("/api/fleet/dashboard").status_code == 401)
                cid = client.post("/api/conversations", json={"vehicle_id": "P456AT178", "session_id": "S-0003"}).json()["conversation_id"]
                replies = []
                for locale in ("ru", "uz", "kk", "tg", "ky", "hi", "bn"):
                    response = client.post(f"/api/conversations/{cid}/messages", json={"message": "Что делать?", "locale": locale})
                    assert response.status_code == 200 and not response.json()["draft"]
                    replies.append(response.json()["reply"])
                check("check_failed: 7 distinct deterministic languages, no ticket", len(set(replies)) == 7)
                cid = client.post("/api/conversations", json={"vehicle_id": "B418HK98", "session_id": "S-0009"}).json()["conversation_id"]
                reply = client.post(f"/api/conversations/{cid}/messages", json={"message": "Можно ли своим ходом перегнать машину на базу?"}).json()
                check("C2 refuses unsupported clearance", "Недостаточно" in reply["reply"] and not reply["draft"])
                asyncio.run(ticket_checks(backend))
        finally:
            httpx.AsyncClient = original
    manifest = json.loads((ROOT / "docs/SOURCE_MANIFEST.json").read_text(encoding="utf-8"))
    # Manifest hashes are canonical LF blobs; Windows checkout may materialize CRLF.
    check("vendor files unchanged", all(
        hashlib.sha256((ROOT / i["repository_path"]).read_bytes().replace(b"\r\n", b"\n")).hexdigest() == i["sha256"]
        for i in manifest["included_mock_files"]
    ))


async def ticket_checks(backend):
    repo, fleet, rag = backend.app_repo, backend.fleet, backend.rag_service
    ml_client, toir_client = MockMlClient("http://mock:8001"), MockToirClient("http://mock:8002")
    def runtime(v, s, analysis=False):
        engine = fleet.session_engine(v, s)
        return ToolRuntime(fleet, ml_client, rag, repo, v, s, engine, repo.create_conversation(v, s, engine, "test"), analysis_only=analysis)

    rt = runtime("B418HK98", "S-0009")
    result = await rt.execute("search_manuals", {"query": "тепловые зазоры клапанного механизма"})
    hit = next(i for i in result["results"] if i["doc_id"] == "y236-re" and i["pdf_page"] in (33, 34))
    torque = await rt.execute("search_manuals", {"query": "момент затяжки крышек коренных подшипников"})
    page = next(i for i in torque["results"] if i["doc_id"] == "y236-re" and i["pdf_page"] == 68)
    check("real agent sees PDF 68", bool(page))
    if page["extraction"] == "poppler-layout":
        raw = rag.get_evidence(page["evidence_id"], full_text=True)["quote"]
        check("table columns intact", "430-470 (43-47)" in raw and "100-120 (10-12)" in raw)
        check("real numeric ranges supported", quantities_supported(rag, [page], "430–470 Н·м и 100–120 Н·м"))
        check("invented numeric range rejected", not quantities_supported(rag, [page], "765–987 Н·м"))
    args = {"conclusion": "Возможное отклонение F01", "urgency": "medium",
            "operations": ["Проверить тепловые зазоры клапанного механизма по руководству"], "spare_parts": [],
            "evidence_ids": [hit["evidence_id"]]}
    check("fake evidence refused", (await rt.execute("prepare_defect_ticket", {**args, "evidence_ids": ["fake"]}))["status"] == "refused")
    check("unsupported operation refused", (await rt.execute("prepare_defect_ticket", {**args, "operations": ["Установить тестовую деталь XYZ-999"]}))["status"] == "refused")
    check("unsupported spare refused", (await rt.execute("prepare_defect_ticket", {**args, "spare_parts": ["XYZ-999"]}))["status"] == "refused")
    draft = await rt.execute("prepare_defect_ticket", args)
    check("F01 grounded draft", draft["status"] == "draft_ready")
    service = TicketService(repo, fleet, ml_client, toir_client, rag)
    check("wrong confirmation rejected", (await service.confirm(draft["draft_id"], "wrong"))["status"] == "error")
    created = await service.confirm(draft["draft_id"], draft["confirm_nonce"])
    check("real original Mock TOiR POST", created["status"] == "created" and created["ticket_id"].startswith("TKT-"))
    second = runtime("B418HK98", "S-0009")
    history = await second.execute("get_vehicle_history", {})
    check("B1 vehicle remembers submitted ticket, not repair", history["submitted_tickets"][0]["ticket_id"] == created["ticket_id"])
    await second.execute("search_manuals", {"query": "тепловые зазоры клапанного механизма"})
    other = await second.execute("prepare_defect_ticket", args)
    check("cross-conversation duplicate blocked", (await service.confirm(other["draft_id"], other["confirm_nonce"]))["status"] == "duplicate")
    for v, s in (("P456AT178", "S-0003"), ("M333YK47", "S-0006")):
        check(f"{s}: no draft", (await runtime(v, s).execute("prepare_defect_ticket", args))["status"] == "refused")
    check("analysis-only no draft", (await runtime("B418HK98", "S-0009", True).execute("prepare_defect_ticket", args))["status"] == "refused")
    fresh = runtime("E549YT198", "S-0011")
    await fresh.execute("search_manuals", {"query": "тепловые зазоры клапанного механизма"})
    d = await fresh.execute("prepare_defect_ticket", args)
    assert d["status"] == "draft_ready"
    class FailingMl:
        async def diagnose(self, *_):
            raise httpx.ConnectError("simulated unavailable")
    failed = await TicketService(repo, fleet, FailingMl(), toir_client).confirm(d["draft_id"], d["confirm_nonce"])
    check("ML preflight retry safe", failed["status"] == "error" and repo.get_draft(d["draft_id"])["status"] == "draft" and not repo.has_blocking_submission("E549YT198", "S-0011"))
    class MalformedToir:
        async def create_ticket(self, _):
            return {"status": "created"}
    unknown = await TicketService(repo, fleet, ml_client, MalformedToir(), rag).confirm(d["draft_id"], d["confirm_nonce"])
    check("missing ticket id => unknown, no retry", unknown["status"] == "unknown" and (await service.confirm(d["draft_id"], d["confirm_nonce"]))["status"] == "unknown")
    # Crash on a fresh draft after claim: replay is forbidden on restart.
    fresh = runtime("B418HK98", "S-0008")
    await fresh.execute("search_manuals", {"query": "тепловые зазоры клапанного механизма"})
    d = await fresh.execute("prepare_defect_ticket", args)
    assert d["status"] == "draft_ready"
    assert repo.claim_draft_sending(d["draft_id"], d["confirm_nonce"])
    assert repo.claim_pair_sending(d["draft_id"], "B418HK98", "S-0008", d["payload"])
    repo.recover_interrupted_submissions()
    check("interrupted external submission blocks retry after restart", (await service.confirm(d["draft_id"], d["confirm_nonce"]))["status"] == "unknown")


if __name__ == "__main__":
    main()
