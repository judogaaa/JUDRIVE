import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.auth.chief_session import hash_password  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.services.analytics import FleetAnalyticsService
from app.services.fleet import FleetService
from app.storage.repository import AppRepository

settings = get_settings()


@pytest.fixture()
def client(monkeypatch) -> TestClient:
    chief = {
        "chief_username": "mechanic",
        "chief_password_hash": hash_password("correct-horse-1", "testsalt"),
        "session_secret": "test-session-secret",
        "cookie_secure": False,
    }
    test_cfg = settings.model_copy(update=chief)
    get_settings.cache_clear()

    def _test_settings():
        return test_cfg

    monkeypatch.setattr("app.config.get_settings", _test_settings)
    monkeypatch.setattr("app.main.get_settings", _test_settings)
    http = TestClient(app)
    denied = http.get("/api/fleet/dashboard")
    assert denied.status_code == 401
    logged = http.post(
        "/api/auth/login",
        json={"username": "mechanic", "password": "correct-horse-1"},
    )
    assert logged.status_code == 200
    return http


def test_dashboard_counts_sum_to_fifty():
    fleet = FleetService(settings.fleet_data_path)
    repo = AppRepository(settings.db_path)
    svc = FleetAnalyticsService(fleet, repo, settings.fleet_data_path)
    data = svc.dashboard()
    assert data.vehicle_count == 50
    assert sum(data.summary.values()) == 50
    assert data.session_stats.total_sessions == 195
    assert data.session_stats.latest_by_status == {
        "normal": 25,
        "anomaly": 23,
        "check_failed": 2,
    }
    quarantine = data.summary["quarantine"]
    assert quarantine <= 23
    assert data.summary["attention"] >= 2


def test_quarantine_not_from_single_normal(client: TestClient):
    resp = client.get("/api/fleet/dashboard")
    assert resp.status_code == 200
    payload = resp.json()
    for row in payload["vehicles"]:
        if row["category"] == "quarantine":
            assert row["quarantine_basis"] or row["ticket_id"]
        if row["latest_status"] == "normal" and row["signal_quality"] == "good":
            assert row["category"] != "quarantine"


def test_vehicle_insight_trend_b418():
    fleet = FleetService(settings.fleet_data_path)
    repo = AppRepository(settings.db_path)
    svc = FleetAnalyticsService(fleet, repo, settings.fleet_data_path)
    insight = svc.vehicle_insight("B418HK98")
    assert insight is not None
    scores = [p.anomaly_score for p in insight.trend_points if p.anomaly_score is not None]
    assert len(scores) >= 3
    assert scores[-1] >= scores[0]