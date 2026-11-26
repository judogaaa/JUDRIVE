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


def test_vehicle_diagnosis_history_public():
    client = TestClient(app)
    vehicles = client.get("/api/vehicles").json()["vehicles"]
    vid = vehicles[0]["vehicle_id"]
    response = client.get(f"/api/vehicles/{vid}/diagnosis-history")
    assert response.status_code == 200
    body = response.json()
    assert body["vehicle_id"] == vid
    assert isinstance(body["trend_points"], list)
    dashboard = client.get("/api/fleet/dashboard")
    assert dashboard.status_code in (401, 403)