import hashlib
import hmac
import time

import pytest
from fastapi.testclient import TestClient

from app import main
from app.auth.chief_session import COOKIE, hash_password


@pytest.fixture
def demo_access(monkeypatch):
    settings = main.get_settings().model_copy(update={
        "session_secret": "test-only-demo-signing-value",
        "chief_username": "123",
        "chief_password_hash": hash_password("123", "test-only-demo-salt"),
        "cookie_secure": True,
        "demo_fleet_sha256": main.fleet.source_sha256,
    })
    monkeypatch.setattr(main, "get_settings", lambda: settings)
    client = TestClient(main.app, base_url="https://testserver")
    try:
        response = client.post("/api/auth/login", json={"username": "123", "password": "123"})
        assert response.status_code == 200
        assert response.json()["role"] == "demo"
        for flag in ("HttpOnly", "Secure", "SameSite=lax"):
            assert flag in response.headers["set-cookie"]
        yield client, settings
    finally:
        client.close()


def test_demo_cannot_access_privileged_routes(demo_access):
    client, _ = demo_access
    routes = [
        ("GET", "/api/manuals/catalog"),
        ("GET", "/api/manuals/status"),
        ("POST", "/api/manuals/search"),
        ("GET", "/api/sources/pdf/y236-re?engine_model=ЯМЗ-236М2"),
        ("GET", "/api/sources/evidence/y236-re:p0031?engine_model=ЯМЗ-236М2"),
        ("POST", "/api/conversations"),
        ("GET", "/api/conversations/sample/messages"),
        ("POST", "/api/conversations/sample/messages"),
        ("POST", "/api/voice/transcribe"),
        ("GET", "/api/tickets"),
        ("GET", "/api/tickets/drafts/sample"),
        ("POST", "/api/tickets/drafts/sample/confirm"),
        ("GET", "/api/fleet/dashboard"),
        ("GET", "/api/fleet/vehicles/B418HK98/insight"),
        ("POST", "/api/fleet/vehicles/B418HK98/quarantine-recommendation"),
    ]
    for method, url in routes:
        assert client.request(method, url, json={} if method == "POST" else None).status_code == 403, url


def test_demo_fleet_requires_an_exact_approved_dataset(demo_access):
    client, settings = demo_access
    assert client.get("/api/auth/session").json() == {"authenticated": True, "role": "demo"}
    assert client.get("/api/vehicles").json()["vehicles"]
    assert client.get("/api/vehicles/B418HK98/diagnosis-history").status_code == 200
    result = client.post("/api/diagnose", json={"vehicle_id": "B418HK98", "session_id": "S-0009"})
    assert result.status_code == 200
    assert result.json()["status"] == "anomaly"
    assert result.json()["description"] == ""
    assert result.json()["anomaly_title"] is None
    settings.demo_fleet_sha256 = "0" * 64
    assert client.get("/api/vehicles").status_code == 403
    assert client.get("/api/vehicles/B418HK98/diagnosis-history").status_code == 403
    assert client.post("/api/diagnose", json={"vehicle_id": "B418HK98", "session_id": "S-0009"}).status_code == 403
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/session").json() == {"authenticated": False, "role": None}


def test_legacy_chief_session_and_altered_demo_role_are_rejected(demo_access):
    client, settings = demo_access
    current = client.cookies.get(COOKIE)
    legacy = f"chief:{int(time.time()) + 3600}"
    signature = hmac.new(settings.session_secret.encode(), legacy.encode(), hashlib.sha256).hexdigest()
    client.cookies.clear()
    for token in (f"{legacy}.{signature}", current.replace(":demo:", ":chief:")):
        response = client.get("/api/fleet/dashboard", headers={"Cookie": f"{COOKIE}={token}"})
        assert response.status_code == 401


def test_login_limit_is_bound_to_the_transport_client(demo_access, monkeypatch):
    from app.auth import chief_session
    from collections import defaultdict

    client, _ = demo_access
    monkeypatch.setattr(chief_session, "_attempts", defaultdict(list))
    for step in range(chief_session.MAX_ATTEMPTS):
        response = client.post("/api/auth/login", json={"username": "123", "password": "wrong"},
                               headers={"X-Real-IP": f"192.0.2.{step + 1}"})
        assert response.status_code == 401
    assert client.post("/api/auth/login", json={"username": "123", "password": "123"},
                       headers={"X-Forwarded-For": "198.51.100.1"}).status_code == 429
