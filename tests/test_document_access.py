from fastapi.testclient import TestClient
import pytest

from app import main


@pytest.mark.parametrize(("method", "url"), [
    ("GET", "/api/vehicles"),
    ("POST", "/api/diagnose"),
    ("POST", "/api/conversations"),
    ("GET", "/api/vehicles/B418HK98/diagnosis-history"),
    ("POST", "/api/voice/transcribe"),
    ("GET", "/api/fleet/dashboard"),
    ("GET", "/api/manuals/catalog"),
    ("GET", "/api/manuals/status"),
    ("POST", "/api/manuals/search"),
    ("GET", "/api/sources/pdf/y236-re?engine_model=ЯМЗ-236М2"),
    ("GET", "/api/sources/evidence/y236-re:p0033?engine_model=ЯМЗ-236М2"),
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


def test_audio_requires_session_before_parsing_multipart(auth_client):
    unauthenticated = TestClient(main.app)
    response = unauthenticated.post(
        "/api/voice/transcribe", content=b"invalid multipart",
        headers={"Content-Type": "multipart/form-data"},
    )
    assert response.status_code == 401
    assert auth_client.post("/api/voice/transcribe", content=b"raw").status_code == 415


@pytest.mark.parametrize("chunked", [False, True])
def test_audio_enforces_request_limit_without_reaching_provider(auth_client, monkeypatch, chunked):
    from app.services import voice

    monkeypatch.setattr(voice, "MAX_AUDIO_REQUEST_BYTES", 512)
    boundary = "judrive-test"
    head = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"sample.wav\"\r\n"
            "Content-Type: audio/wav\r\n\r\n").encode()
    parts = (head, b"\0" * 600, f"\r\n--{boundary}--\r\n".encode())
    request = auth_client.build_request(
        "POST", "/api/voice/transcribe", content=iter(parts) if chunked else b"".join(parts),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    assert ("content-length" not in request.headers) == chunked
    response = auth_client.send(request)
    assert response.status_code == 413


def test_evidence_is_not_served_after_its_pdf_changes(auth_client, tmp_path, monkeypatch):
    from app.rag.service import ManualRagService
    from synthetic_manuals import generate

    directory = tmp_path / "pdf"
    generate(directory)
    rag = ManualRagService(tmp_path / "index.sqlite", directory)
    rag.ensure_index()
    monkeypatch.setattr(main, "rag_service", rag)
    params = {"engine_model": "ЯМЗ-236М2"}
    url = "/api/sources/evidence/y236-re:p0033"
    assert auth_client.get(url, params=params).status_code == 200

    path = rag.resolve_pdf_path("y236-re")
    assert path is not None
    with path.open("ab") as handle:
        handle.write(b"\n% revised file bytes\n")
    assert rag.get_evidence("y236-re:p0033") is None
    assert auth_client.get(url, params=params).status_code == 404
    assert not rag.status()["index_current"]
    assert rag.get_evidence("y236-rk:p0269") is not None
