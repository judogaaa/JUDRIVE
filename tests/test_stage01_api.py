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