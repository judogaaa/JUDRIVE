import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402
from app.services.fleet import FleetService  # noqa: E402


def test_fleet_counts():
    settings = get_settings()
    fleet = FleetService(settings.fleet_data_path)
    vehicles = fleet.list_vehicles()
    assert len(vehicles) == 50
    sessions = sum(len(v.sessions) for v in vehicles)
    assert sessions == 195


@pytest.mark.parametrize(
    ("vehicle_id", "session_id", "expected_status"),
    [
        ("M333YK47", "S-0006", "normal"),
        ("B418HK98", "S-0009", "anomaly"),
        ("P456AT178", "S-0003", "check_failed"),
    ],
)
def test_diagnose_acceptance_pairs(vehicle_id, session_id, expected_status):
    httpx = pytest.importorskip("httpx")
    settings = get_settings()
    try:
        with httpx.Client(base_url=settings.mock_ml_url, timeout=10.0) as client:
            health = client.get("/health")
            if health.status_code != 200:
                pytest.skip("Mock ML не запущен")
            response = client.post(
                "/diagnose",
                json={"vehicle_id": vehicle_id, "session_id": session_id},
            )
    except httpx.HTTPError:
        pytest.skip("Mock ML недоступен")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == expected_status
    if expected_status == "check_failed":
        assert payload["anomaly_score"] is None
        assert payload["confidence"] is None