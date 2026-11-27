"""Deterministic rules with temporary SQLite and synthetic sources."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.agent.evidence import has_node_procedure, operating_prohibition, quantities_supported
from app.agent.guardrails import apply_engine_context, can_create_ticket, diagnosis_hash
from app.rag.conflicts import valve_temperature_conflict
from app.schemas.diagnose import DiagnoseResponse
from app.services.tickets import TicketService
from app.storage.repository import AppRepository


def diagnosis(**kwargs):
    fields = dict(vehicle_id="B418HK98", session_id="S-0009", status="anomaly",
                  anomaly_type="F01", anomaly_title="Клапанный механизм", anomaly_score=.75,
                  confidence=.50, signal_quality="warning", description="", model_version="mock-v1",
                  engine_model="ЯМЗ-236М2")
    return DiagnoseResponse(**(fields | kwargs))


@pytest.mark.parametrize(("confidence", "signal", "expected"), [
    (.49, "good", False), (.50, "warning", True), (.90, "bad", False), (None, "good", False),
])
def test_threshold(confidence, signal, expected):
    assert can_create_ticket(diagnosis(confidence=confidence, signal_quality=signal))[0] is expected


@pytest.mark.parametrize("engine", ["ЯМЗ-236М2", "ЗМЗ-5234.10", "unknown", None])
def test_f14_is_not_relabelled_for_another_engine(engine):
    diag = apply_engine_context(diagnosis(anomaly_type="F14"), engine)
    assert diag.status == "check_failed"
    assert "F14" in diag.description
    assert diag.anomaly_type is None and diag.confidence is None
    assert not can_create_ticket(diag)[0]


def test_warning_requires_ack_and_changed_priority_is_saved(tmp_path):
    repo = AppRepository(tmp_path / "tickets.sqlite")
    orig = diagnosis()
    payload = dict(vehicle_id=orig.vehicle_id, session_id=orig.session_id, urgency="medium", anomaly_type="F01",
                   operations=["Проверить зазор клапанного механизма"],
                   references=[{"manual": "236-3902150-Б РЭ", "pdf_page": 33}])
    draft = repo.save_draft("test", orig.vehicle_id, orig.session_id, diagnosis_hash(orig), payload)
    args = draft["draft_id"], draft["confirm_nonce"]
    submissions = []

    async def get_ml(*pair):
        assert pair == (orig.vehicle_id, orig.session_id)
        return orig.model_copy()

    async def send(payload):
        await asyncio.sleep(0)
        submissions.append(payload)
        return {"ticket_id": "TKT-TEST"}

    source = {"evidence_id": "y236-re:p0033", "doc_id": "y236-re", "manual_title": "236-3902150-Б РЭ",
              "pdf_page": 33, "quote": "Проверьте зазор клапанного механизма.", "extraction": "poppler-layout"}
    rag = SimpleNamespace(status=lambda: {"index_current": True},
                          search=lambda *args: {"status": "ok"},
                          get_evidence=lambda page, **kwargs: source if page == source["evidence_id"] else None)
    service = TicketService(repo, SimpleNamespace(session_engine=lambda *_: orig.engine_model),
                            SimpleNamespace(diagnose=get_ml), SimpleNamespace(create_ticket=send), rag)

    async def exercise():
        assert (await service.confirm(*args))["status"] == "warning_unacknowledged"
        assert not submissions
        assert (await service.confirm(*args, warning_acknowledged=True, urgency="invalid"))["status"] == "refused"
        results = await asyncio.gather(*(
            service.confirm(*args, warning_acknowledged=True, urgency="high") for _ in range(2)
        ))
        assert sum(row["status"] == "created" for row in results) == 1

    asyncio.run(exercise())
    assert [row["urgency"] for row in submissions] == ["high"]
    assert '"urgency": "high"' in next(row["payload_snapshot"] for row in repo.list_tickets()
                                      if row["submit_status"] == "created")


def test_conflicting_conditions_need_both_documents_and_same_engine():
    rows = {
        "y236-re:p0031": dict(doc_id="y236-re", quote="Зазоры регулируют на холодном двигателе."),
        "y236-rk:p0269": dict(doc_id="y236-rk", quote="Зазоры регулируют не ранее чем через 15 минут."),
        "y236-rk:p0276": dict(doc_id="y236-rk", quote="Ремень проверяют не ранее чем через 15 минут."),
    }
    load = lambda page, **_: rows.get(page)
    assert [hit["doc_id"] for hit in valve_temperature_conflict("ЯМЗ-236М2", "зазор", load)] == ["y236-re", "y236-rk"]
    assert not valve_temperature_conflict("ЯМЗ-536", "зазор", load)
    assert not valve_temperature_conflict("ЯМЗ-236М2", "генератор", load)
    rows["y236-rk:p0269"]["quote"] = "Зазоры проверяют не ранее чем через 15 минут."
    assert not valve_temperature_conflict("ЯМЗ-236М2", "зазор", load)


def test_procedure_needs_node_and_measurement_needs_same_unit():
    cite = {"evidence_id": "test"}
    page = dict(quote="Измерьте зазор клапанов: 0,3 мм.", extraction="poppler-layout")
    rag = SimpleNamespace(get_evidence=lambda *a, **kw: page)
    assert has_node_procedure(rag, [cite], "F01")
    assert not has_node_procedure(rag, [cite], "F14")
    assert quantities_supported(rag, [cite], "0.3 мм")
    assert not quantities_supported(rag, [cite], "0.3 МПа")
    page["extraction"] = "ocr"
    assert not quantities_supported(rag, [cite], "0.3 мм")


def test_operating_prohibition_requires_direct_document_language():
    assert operating_prohibition({"quote": "Эксплуатация при утечке масла запрещена."})
    assert operating_prohibition({"quote": "Проверить узел до выпуска в рейс."}) is None
    assert operating_prohibition(None) is None


def test_changed_diagnosis_rolls_back_confirmation(tmp_path):
    repo = AppRepository(tmp_path / "stale.sqlite")
    orig = diagnosis(signal_quality="good")
    payload = dict(vehicle_id=orig.vehicle_id, session_id=orig.session_id, urgency="medium", anomaly_type="F01")
    draft = repo.save_draft("test", orig.vehicle_id, orig.session_id, diagnosis_hash(orig), payload)

    async def ml(*_):
        return orig.model_copy(update={"confidence": .70})

    async def cannot_send(*_):
        pytest.fail("Stale draft reached TOiR")

    service = TicketService(repo, SimpleNamespace(session_engine=lambda *_: orig.engine_model),
                            SimpleNamespace(diagnose=ml), SimpleNamespace(create_ticket=cannot_send))
    result = asyncio.run(service.confirm(draft["draft_id"], draft["confirm_nonce"]))
    assert result["status"] == "stale"
    assert repo.get_draft(draft["draft_id"])["status"] == "stale"
    assert repo.list_tickets()[0]["submit_status"] == "refused"


def test_request_cannot_override_bound_fields():
    from pydantic import ValidationError
    from app.schemas.tickets import TicketConfirmRequest

    fields = {"confirm_nonce": "test-only", "acknowledge": True}
    for override in ({"vehicle_id": "other"}, {"session_id": "other"}, {"anomaly_type": "F01"},
                     {"urgency": "critical"}, {"warning_acknowledged": "true"}):
        with pytest.raises(ValidationError):
            TicketConfirmRequest.model_validate(fields | override)


def test_usage_groups_all_measured_calls_of_one_check(tmp_path):
    import sqlite3

    path = tmp_path / "usage.sqlite"
    repo = AppRepository(path)
    one, two = [repo.create_conversation("V1", "S1", "ЯМЗ-236М2", "test") for _ in range(2)]
    repo.log_usage_step(one, "tool_selection", {"total_tokens": 12})
    repo.log_usage_step(one, "answer", {"total_tokens": 15})
    repo.log_usage_step(two, "answer", {"total_tokens": 17})
    with sqlite3.connect(path) as conn:
        rows = conn.execute("SELECT stage, calls, total_tokens FROM llm_usage_by_check WHERE provider='gigachat' ORDER BY stage").fetchall()
    assert rows == [("answer", 2, 32), ("tool_selection", 1, 12)]


def test_control_vehicle_rejects_f14_in_public_diagnosis(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main

    async def ml(vehicle, session):
        assert (vehicle, session) == ("P854BT78", "S-0021")
        return diagnosis(vehicle_id=vehicle, session_id=session, anomaly_type="F14")

    monkeypatch.setattr(main.mock_ml, "diagnose", ml)
    client = TestClient(main.app)
    result = client.post("/api/diagnose", json={"vehicle_id": "P854BT78", "session_id": "S-0021"})
    assert result.status_code == 200
    row = result.json()
    assert row["diagnostic_issue"] == "engine_mismatch"
    assert row["engine_model"] == "ЯМЗ-236М2"
    assert row["anomaly_type"] is None and row["anomaly_score"] is None


def test_confirm_blocks_missing_source_validator(tmp_path):
    repo = AppRepository(tmp_path / "no-evidence.sqlite")
    orig = diagnosis(signal_quality="good")
    payload = dict(vehicle_id=orig.vehicle_id, session_id=orig.session_id, urgency="medium", anomaly_type="F01")
    draft = repo.save_draft("test", orig.vehicle_id, orig.session_id, diagnosis_hash(orig), payload)

    async def ml(*_):
        return orig.model_copy()

    async def cannot_send(*_):
        pytest.fail("Draft without a source validator reached TOiR")

    service = TicketService(repo, SimpleNamespace(session_engine=lambda *_: orig.engine_model),
                            SimpleNamespace(diagnose=ml), SimpleNamespace(create_ticket=cannot_send))
    result = asyncio.run(service.confirm(draft["draft_id"], draft["confirm_nonce"]))
    assert result["status"] == "refused"


@pytest.mark.parametrize(("code", "score", "quality", "priority"), [
    ("F02", .80, "good", "high"), ("F01", .30, "warning", "medium"), ("F01", .30, "good", "low"),
])
def test_analytical_priority_uses_recorded_facts(code, score, quality, priority):
    from app.services.analytics import diagnosis_review_priority

    diag = diagnosis(anomaly_type=code, anomaly_score=score, signal_quality=quality, confidence=.85)
    history = [{"session_id": diag.session_id, "checked_at": "2026-11-26T00:00:00Z"}]
    fleet = SimpleNamespace(vehicle_history=lambda *_: history)
    assert diagnosis_review_priority(fleet, diag) == priority


_EXPECTED_CANDIDATES = {
    "ЯМЗ-236М2": {1, 2, 3, 4, 5, 6, 7, 8},
    "ЯМЗ-536": {1, 2, 3, 4, 5, 6, 7, 8, 9},
    "ЗМЗ-5234.10": {1, 2, 3, 4, 5, 6, 7, 12, 13},
    "ЗМЗ-40904.10": {1, 2, 3, 4, 5, 6, 7, 12, 13, 14},
    "ЗМЗ-40905.10": {1, 2, 3, 4, 5, 6, 7, 12, 13, 14},
}


@pytest.mark.parametrize(("engine", "number"), [
    (engine, number) for engine in [*_EXPECTED_CANDIDATES, "unverified"] for number in range(1, 15)
])
def test_fault_matrix(engine, number):
    code = f"F{number:02d}"
    result = apply_engine_context(diagnosis(anomaly_type=code), engine)
    if number in _EXPECTED_CANDIDATES.get(engine, set()):
        assert result.anomaly_type == code and result.status == "anomaly"
    else:
        assert result.status == "check_failed"
        assert result.anomaly_type is None and code in result.description
        assert not can_create_ticket(result)[0]
