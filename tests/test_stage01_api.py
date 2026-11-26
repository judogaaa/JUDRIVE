import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402


def test_vehicles_endpoint():
    client = TestClient(app)
    response = client.get("/api/vehicles")
    assert response.status_code == 200
    vehicles = response.json()["vehicles"]
    assert len(vehicles) == 50


def test_vehicle_diagnosis_history_public(monkeypatch):
    client = TestClient(app)
    vehicles = client.get("/api/vehicles").json()["vehicles"]
    vid = vehicles[0]["vehicle_id"]
    response = client.get(f"/api/vehicles/{vid}/diagnosis-history")
    assert response.status_code == 200
    body = response.json()
    assert body["vehicle_id"] == vid
    assert isinstance(body["trend_points"], list)
    from app.config import get_settings
    from app.auth.chief_session import hash_password
    cfg = get_settings().model_copy(update={"chief_username": "test-chief",
        "chief_password_hash": hash_password("test-only-password", "testsalt"),
        "session_secret": "test-only-session-secret"})
    monkeypatch.setattr("app.main.get_settings", lambda: cfg)
    dashboard = client.get("/api/fleet/dashboard")
    assert dashboard.status_code == 401
    monkeypatch.setattr("app.main.get_settings", lambda: cfg.model_copy(update={"chief_username": None}))
    assert client.get("/api/fleet/dashboard").status_code == 503