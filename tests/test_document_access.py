from fastapi.testclient import TestClient
import pytest

from app import main


@pytest.mark.parametrize(("method", "url"), [
    ("GET", "/api/manuals/catalog"),
    ("GET", "/api/manuals/status"),
    ("POST", "/api/manuals/search"),
    ("GET", "/api/sources/pdf/y236-re?engine_model=ЯМЗ-236М2"),
    ("GET", "/api/sources/evidence/y236-re:p0033?engine_model=ЯМЗ-236М2"),
    ("POST", "/api/conversations"),
    ("POST", "/api/voice/transcribe"),
    ("GET", "/api/conversations/demo/messages"),
    ("POST", "/api/conversations/demo/messages"),
    ("GET", "/api/tickets/drafts/demo"),
    ("POST", "/api/tickets/drafts/demo/confirm"),
    ("GET", "/api/tickets"),
    ("GET", "/api/fleet/vehicles/B418HK98/insight"),
])
def test_anonymous_and_forged_cookie_cannot_read_corpus(auth_client, method, url):
    client = TestClient(main.app)
    for cookie in ({}, {"Cookie": "judrive_chief=chief:9999999999.forged"}):
        response = client.request(method, url, headers=cookie | {"Range": "bytes=0-31"}, json={})
        assert response.status_code == 401
        assert "quote" not in response.text


def test_document_scope_and_physical_pdf(auth_client, synthetic_rag, monkeypatch):
    synthetic_rag.ensure_index()
    monkeypatch.setattr(main, "rag_service", synthetic_rag)
    engine = {"engine_model": "ЯМЗ-236М2", "vehicle_id": "B418HK98", "session_id": "S-0009"}
    pdf = auth_client.get("/api/sources/pdf/y236-re", params=engine, headers={"Range": "bytes=0-31"})
    assert pdf.status_code == 206 and pdf.content.startswith(b"%PDF-")
    assert pdf.headers["cache-control"] == "private, no-store"
    evidence = auth_client.get("/api/sources/evidence/y236-re:p0033", params=engine)
    assert evidence.status_code == 200 and evidence.json()["pdf_page"] == 33
    assert "filename" not in evidence.json()

    foreign = engine | {"engine_model": "ЗМЗ-5234.10"}
    assert auth_client.get("/api/sources/pdf/z5234-rk", params=foreign).status_code == 404
    assert auth_client.get("/api/sources/pdf/z5234-rk", params=engine).status_code == 404
    assert auth_client.get("/api/sources/evidence/z5234-rk:p0012", params=engine).status_code == 404
    assert auth_client.post("/api/manuals/search", json=foreign | {"query": "зажигание"}).status_code == 404
    assert auth_client.post("/api/manuals/search", json=engine | {"query": "тепловые зазоры"}).json()["status"] == "conflict"
    assert not ({"pdf_dir", "db_path"} & auth_client.get("/api/manuals/status").json().keys())


def test_confirm_http_rejects_identity_overrides(auth_client, monkeypatch):
    from types import SimpleNamespace

    async def unexpected_confirm(*args, **kwargs):
        pytest.fail("Unvalidated confirmation reached the ticket service")

    monkeypatch.setattr(main, "ticket_service", SimpleNamespace(confirm=unexpected_confirm))
    url = "/api/tickets/drafts/some-draft/confirm"
    base = {"confirm_nonce": "test-only-nonce", "acknowledge": True}
    for override in ({"vehicle_id": "B418HK98"}, {"session_id": "S-0009"}, {"anomaly_type": "F01"},
                     {"warning_acknowledged": "true"}):
        assert auth_client.post(url, json=base | override).status_code == 422
    assert auth_client.post(url, json=base | {"acknowledge": False}).status_code == 400
