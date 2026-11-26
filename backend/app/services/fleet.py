import json
from pathlib import Path

from app.schemas.fleet import SessionSummary, VehicleSummary


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
                )
            )
            for session in item["sessions"]:
                index[(item["vehicle_id"], session["session_id"])] = item["engine_model"]
        session_by_vehicle: dict[str, list[dict]] = {}
        for item in payload["vehicles"]:
            session_by_vehicle[item["vehicle_id"]] = list(item["sessions"])

        self._vehicles = vehicles
        self._session_index = index
        self._vehicle_sessions = session_by_vehicle

    def list_vehicles(self) -> list[VehicleSummary]:
        return self._vehicles

    def session_engine(self, vehicle_id: str, session_id: str) -> str | None:
        return self._session_index.get((vehicle_id, session_id))

    def validate_pair(self, vehicle_id: str, session_id: str) -> bool:
        return (vehicle_id, session_id) in self._session_index

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