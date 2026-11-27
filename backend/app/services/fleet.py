import json
from pathlib import Path

from app.agent.guardrails import FAULT_ENGINES
from app.schemas.fleet import SessionSummary, VehicleSummary


def safe_history_session(item: dict, engine: str) -> dict:
    mismatch = item.get("status") == "anomaly" and engine not in FAULT_ENGINES.get(item.get("anomaly_type"), ())
    if mismatch or item.get("signal_quality") == "bad" or item.get("status") == "check_failed":
        return {**item, "status": "check_failed", "anomaly_type": None, "anomaly_title": None,
                "anomaly_score": None, "confidence": None}
    return item


class FleetService:
    def __init__(self, data_path: Path) -> None:
        self._data_path = data_path
        self._session_index: dict[tuple[str, str], str] = {}
        self._vehicles: list[VehicleSummary] = []
        self._vehicle_sessions: dict[str, list[dict]] = {}
        self.reload()

    def reload(self) -> None:
        with self._data_path.open(encoding="utf-8") as f:
            payload = json.load(f)
        vehicles: list[VehicleSummary] = []
        index: dict[tuple[str, str], str] = {}
        for item in payload["vehicles"]:
            sessions = [
                SessionSummary(
                    session_id=s["session_id"],
                    checked_at=s["checked_at"],
                )
                for s in item["sessions"]
            ]
            safe_sessions = [safe_history_session(s, item["engine_model"]) for s in item["sessions"]]
            ordered_sessions = sorted(safe_sessions, key=lambda s: s["checked_at"])
            vehicles.append(
                VehicleSummary(
                    vehicle_id=item["vehicle_id"],
                    garage_no=item["garage_no"],
                    make=item["make"],
                    model=item.get("model"),
                    vehicle_type=item["vehicle_type"],
                    engine_model=item["engine_model"],
                    fuel=item["fuel"],
                    sessions=sessions,
                    latest_session_id=(ordered_sessions[-1]["session_id"] if ordered_sessions else None),
                    latest_status=(ordered_sessions[-1].get("status") if ordered_sessions else None),
                    latest_signal_quality=(ordered_sessions[-1].get("signal_quality") if ordered_sessions else None),
                )
            )
            for session in item["sessions"]:
                index[(item["vehicle_id"], session["session_id"])] = item["engine_model"]
        session_by_vehicle: dict[str, list[dict]] = {}
        for item in payload["vehicles"]:
            session_by_vehicle[item["vehicle_id"]] = [safe_history_session(s, item["engine_model"]) for s in item["sessions"]]

        self._vehicles = vehicles
        self._session_index = index
        self._vehicle_sessions = session_by_vehicle

    def list_vehicles(self) -> list[VehicleSummary]:
        return self._vehicles

    def session_engine(self, vehicle_id: str, session_id: str) -> str | None:
        return self._session_index.get((vehicle_id, session_id))

    def validate_pair(self, vehicle_id: str, session_id: str) -> bool:
        return (vehicle_id, session_id) in self._session_index

    def vehicle_known(self, vehicle_id: str) -> bool:
        return vehicle_id in self._vehicle_sessions

    def diagnosis_trend(self, vehicle_id: str) -> list[dict]:
        sessions = self._vehicle_sessions.get(vehicle_id, [])
        ordered = sorted(sessions, key=lambda s: s["checked_at"])
        trend: list[dict] = []
        for item in ordered[-12:]:
            failed = item.get("status") == "check_failed" or item.get("signal_quality") == "bad"
            trend.append(
                {
                    "session_id": item["session_id"],
                    "checked_at": item["checked_at"],
                    "status": "check_failed" if failed else item["status"],
                    "anomaly_score": None if failed else item.get("anomaly_score"),
                    "anomaly_type": None if failed else item.get("anomaly_type"),
                    "skipped": failed,
                }
            )
        return trend

    def vehicle_history(self, vehicle_id: str) -> list[dict]:
        sessions = self._vehicle_sessions.get(vehicle_id, [])
        history: list[dict] = []
        for item in sessions:
            history.append(
                {
                    "session_id": item["session_id"],
                    "checked_at": item["checked_at"],
                    "status": item["status"],
                    "anomaly_type": item.get("anomaly_type"),
                    "anomaly_title": item.get("anomaly_title"),
                    "anomaly_score": item.get("anomaly_score"),
                    "confidence": item.get("confidence"),
                    "signal_quality": item.get("signal_quality"),
                }
            )
        return history