from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.schemas.analytics import (
    EarlyWarning,
    FleetDashboardResponse,
    FleetSessionStats,
    TrendPoint,
    VehicleFleetRow,
    VehicleInsightResponse,
)
from app.services.fleet import FleetService, safe_history_session
from app.storage.repository import AppRepository

# Типы отклонений, для которых допустима high-рекомендация без LLM (названия из fault_types).
HIGH_RISK_ANOMALY_TYPES = frozenset({"F02", "F03", "F07", "F09", "F14"})


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _latest_session(sessions: list[dict]) -> dict:
    return max(sessions, key=lambda s: _parse_dt(s["checked_at"]))


def _valid_score_sessions(sessions: list[dict], limit: int = 5) -> list[dict]:
    ordered = sorted(sessions, key=lambda s: _parse_dt(s["checked_at"]))
    picked: list[dict] = []
    for s in reversed(ordered):
        if s.get("status") == "check_failed" or s.get("anomaly_score") is None:
            continue
        picked.append(s)
        if len(picked) >= limit:
            break
    picked.reverse()
    return picked


def _score_trend_up(valid: list[dict]) -> bool:
    scores = [float(s["anomaly_score"]) for s in valid if s.get("anomaly_score") is not None]
    if len(scores) < 2:
        return False
    return scores[-1] > scores[0] and scores[-1] - scores[0] >= 0.15


def _recurring_type(sessions: list[dict], code: str | None) -> bool:
    if not code:
        return False
    hits = sum(1 for s in sessions if s.get("anomaly_type") == code and s.get("status") == "anomaly")
    return hits >= 2


def _urgency_band(latest: dict, warnings: list[EarlyWarning]) -> str | None:
    status = latest.get("status")
    if status == "check_failed" or latest.get("signal_quality") == "bad":
        return "high"
    if status != "anomaly":
        return None
    score = latest.get("anomaly_score")
    atype = latest.get("anomaly_type")
    if atype in HIGH_RISK_ANOMALY_TYPES and isinstance(score, (int, float)) and score >= 0.75:
        return "high"
    if any(w.code == "recurring_anomaly" for w in warnings) and isinstance(score, (int, float)) and score >= 0.65:
        return "high"
    if latest.get("signal_quality") == "warning" or (isinstance(score, (int, float)) and score >= 0.5) or (isinstance(latest.get("confidence"), (int, float)) and latest["confidence"] < 0.65):
        return "medium"
    return "low"


def diagnosis_review_priority(fleet: FleetService, diag) -> str | None:
    if diag.status != "anomaly" or diag.signal_quality == "bad":
        return None
    history = fleet.vehicle_history(diag.vehicle_id)
    selected = next((item for item in history if item["session_id"] == diag.session_id), None)
    if not selected:
        return None
    current = {**selected, **diag.model_dump()}
    prior = [s for s in history if s["checked_at"] <= selected["checked_at"] and s["session_id"] != diag.session_id]
    warnings = _collect_warnings(diag.vehicle_id, [*prior, current], current)
    band = _urgency_band(current, warnings)
    # No low-priority reassurance from a low-confidence signal.
    if diag.confidence is not None and diag.confidence < 0.65 and band == "low":
        return "medium"
    return band


def _collect_warnings(vehicle_id: str, sessions: list[dict], latest: dict) -> list[EarlyWarning]:
    warnings: list[EarlyWarning] = []
    valid = _valid_score_sessions(sessions, limit=5)
    atype = latest.get("anomaly_type")
    if _recurring_type(sessions, atype):
        warnings.append(
            EarlyWarning(
                code="recurring_anomaly",
                message=f"Повторяющееся отклонение {atype} в истории проверок",
            )
        )
    if _score_trend_up(valid):
        warnings.append(
            EarlyWarning(
                code="score_trend_up",
                message="Рост anomaly_score по последним валидным записям (не прогноз отказа)",
            )
        )
    if latest.get("status") == "check_failed":
        prev = sorted(sessions, key=lambda s: _parse_dt(s["checked_at"]))
        if len(prev) >= 2 and prev[-2].get("status") == "anomaly":
            warnings.append(
                EarlyWarning(
                    code="failed_after_anomaly",
                    message="После аномалии запись не удалась — нужна повторная диагностика",
                )
            )
    if latest.get("status") == "check_failed" or latest.get("signal_quality") == "bad":
        warnings.append(
            EarlyWarning(
                code="rerecord",
                message="Сбой или плохое качество записи — диагноз недоступен",
            )
        )
    _ = vehicle_id
    return warnings


def _high_ticket_for_vehicle(repo: AppRepository, vehicle_id: str) -> dict | None:
    for row in repo.list_tickets(vehicle_id):
        if row.get("submit_status") != "created":
            continue
        snap = row.get("payload_snapshot")
        if not snap:
            continue
        try:
            payload = json.loads(snap)
        except json.JSONDecodeError:
            continue
        if str(payload.get("urgency", "")).lower() == "high":
            return {
                "ticket_id": row.get("ticket_id"),
                "session_id": row.get("session_id"),
                "payload": payload,
            }
    return None


def _classify_vehicle(
    vehicle: dict,
    sessions: list[dict],
    high_ticket: dict | None,
    quarantine: dict | None = None,
) -> VehicleFleetRow:
    latest = _latest_session(sessions)
    warnings = _collect_warnings(vehicle["vehicle_id"], sessions, latest)
    band = _urgency_band(latest, warnings)

    category: str = "normal"
    reason = "Последняя проверка: норма"
    quarantine_basis: str | None = None
    quarantine_recommended = False
    needs_rerecord = latest.get("status") == "check_failed" or latest.get("signal_quality") == "bad"
    ticket_id = high_ticket.get("ticket_id") if high_ticket else None

    if needs_rerecord:
        category, reason = "attention", "Сбой или плохое качество записи — требуется повторная диагностика"
    elif latest.get("status") == "anomaly":
        category = "attention"
        reason = f"Отклонение {latest.get('anomaly_type') or '—'} на последней проверке"
        if band == "high":
            reason += "; высокий приоритет проверки, решение о карантине только специалистом"
    elif latest.get("signal_quality") == "warning":
        category, reason = "attention", "Норма с предупреждением о качестве сигнала"
    if high_ticket and category == "normal":
        category, reason = "attention", "Есть ранее созданная high-заявка — уточните выполнение ремонта"

    if quarantine and latest.get("status") == "anomaly" and not needs_rerecord:
        category = "quarantine"
        quarantine_recommended = True
        quarantine_basis = quarantine["reason"]
        reason = quarantine_basis

    priority = 0
    if category == "quarantine":
        priority = 1000
    elif needs_rerecord:
        priority = 900
    elif latest.get("status") == "anomaly":
        score = latest.get("anomaly_score") or 0
        priority = 500 + int(float(score) * 100)
    elif latest.get("signal_quality") == "warning":
        priority = 200
    priority += len(warnings) * 15
    if band == "high":
        priority += 80
    elif band == "medium":
        priority += 40

    # A chief recommendation is not an operational quarantine. The product has
    # no confirmed quarantine workflow, so this flag stays false until a real
    # operational action exists.
    confirmed = False
    return VehicleFleetRow(
        vehicle_id=vehicle["vehicle_id"],
        garage_no=vehicle["garage_no"],
        make=vehicle["make"],
        model=vehicle.get("model"),
        vehicle_type=vehicle["vehicle_type"],
        engine_model=vehicle["engine_model"],
        category=category,  # type: ignore[arg-type]
        priority_score=priority,
        urgency_band=band,  # type: ignore[arg-type]
        latest_session_id=latest["session_id"],
        latest_checked_at=latest["checked_at"],
        latest_status=str(latest.get("status")),
        signal_quality=str(latest.get("signal_quality")),
        anomaly_type=latest.get("anomaly_type"),
        anomaly_title=latest.get("anomaly_title"),
        anomaly_score=latest.get("anomaly_score"),
        confidence=latest.get("confidence"),
        category_reason=reason,
        needs_rerecord=needs_rerecord,
        quarantine_basis=quarantine_basis,
        quarantine_recommended=quarantine_recommended,
        quarantine_confirmed=confirmed,
        early_warnings=warnings,
        ticket_id=ticket_id,
    )


def _aggregate_stats(raw_vehicles: list[dict]) -> FleetSessionStats:
    by_status: dict[str, int] = {}
    by_signal: dict[str, int] = {}
    by_engine: dict[str, int] = {}
    by_anomaly: dict[str, int] = {}
    latest_by_status: dict[str, int] = {"normal": 0, "anomaly": 0, "check_failed": 0}
    total = 0
    for vehicle in raw_vehicles:
        sessions = vehicle["sessions"]
        total += len(sessions)
        for s in sessions:
            by_status[s["status"]] = by_status.get(s["status"], 0) + 1
            sq = s.get("signal_quality") or "unknown"
            by_signal[sq] = by_signal.get(sq, 0) + 1
            at = s.get("anomaly_type")
            if at:
                by_anomaly[at] = by_anomaly.get(at, 0) + 1
        engine = vehicle["engine_model"]
        by_engine[engine] = by_engine.get(engine, 0) + len(sessions)
        latest = _latest_session(sessions)
        latest_by_status[latest["status"]] = latest_by_status.get(latest["status"], 0) + 1
    return FleetSessionStats(
        total_sessions=total,
        by_status=by_status,
        by_signal_quality=by_signal,
        by_engine_model=by_engine,
        by_anomaly_type=by_anomaly,
        latest_by_status=latest_by_status,
    )


class FleetAnalyticsService:
    def __init__(self, fleet: FleetService, repo: AppRepository, raw_path) -> None:
        self._fleet = fleet
        self._repo = repo
        with raw_path.open(encoding="utf-8") as f:
            payload = json.load(f)
        self._raw_vehicles = [
            {**vehicle, "sessions": [safe_history_session(s, vehicle["engine_model"]) for s in vehicle["sessions"]]}
            for vehicle in payload["vehicles"]
        ]
        self._synthetic = bool(payload.get("synthetic", True))

    def build_rows(self) -> list[VehicleFleetRow]:
        rows: list[VehicleFleetRow] = []
        for vehicle in self._raw_vehicles:
            sessions = vehicle["sessions"]
            high_ticket = _high_ticket_for_vehicle(self._repo, vehicle["vehicle_id"])
            rows.append(_classify_vehicle(vehicle, sessions, high_ticket, self._repo.quarantine_recommendation(vehicle["vehicle_id"], _latest_session(sessions)["session_id"])))
        return rows

    def dashboard(
        self,
        *,
        category: str | None = None,
        engine_model: str | None = None,
        vehicle_type: str | None = None,
        query: str | None = None,
    ) -> FleetDashboardResponse:
        rows = self.build_rows()
        stats = _aggregate_stats(self._raw_vehicles)
        summary = {"normal": 0, "attention": 0, "quarantine": 0}
        for row in rows:
            summary[row.category] += 1

        def matches(row: VehicleFleetRow) -> bool:
            if category and row.category != category:
                return False
            if engine_model and row.engine_model != engine_model:
                return False
            if vehicle_type and row.vehicle_type != vehicle_type:
                return False
            if query:
                q = query.lower()
                hay = " ".join(
                    [
                        row.vehicle_id,
                        row.garage_no,
                        row.make,
                        row.model or "",
                        row.engine_model,
                        row.vehicle_type,
                    ]
                ).lower()
                if q not in hay:
                    return False
            return True

        filtered = [r for r in rows if matches(r)]
        queue = sorted(
            [r for r in rows if r.category in ("attention", "quarantine")],
            key=lambda r: (-r.priority_score, r.vehicle_id),
        )
        fleet_warnings: list[dict[str, str]] = []
        for row in rows:
            for w in row.early_warnings:
                fleet_warnings.append(
                    {"vehicle_id": row.vehicle_id, "code": w.code, "message": w.message}
                )

        engine_models = sorted({r.engine_model for r in rows})
        vehicle_types = sorted({r.vehicle_type for r in rows})

        return FleetDashboardResponse(
            synthetic=self._synthetic,
            vehicle_count=len(rows),
            session_stats=stats,
            summary=summary,
            priority_queue=queue,
            vehicles=filtered,
            early_warnings_fleet=fleet_warnings[:80],
            engine_models=engine_models,
            vehicle_types=vehicle_types,
        )

    def vehicle_insight(self, vehicle_id: str) -> VehicleInsightResponse | None:
        vehicle = next((v for v in self._raw_vehicles if v["vehicle_id"] == vehicle_id), None)
        if not vehicle:
            return None
        sessions = vehicle["sessions"]
        high_ticket = _high_ticket_for_vehicle(self._repo, vehicle_id)
        row = _classify_vehicle(vehicle, sessions, high_ticket, self._repo.quarantine_recommendation(vehicle_id, _latest_session(sessions)["session_id"]))
        ordered = sorted(sessions, key=lambda s: _parse_dt(s["checked_at"]))
        trend: list[TrendPoint] = []
        for s in ordered[-8:]:
            failed = s.get("status") == "check_failed"
            trend.append(
                TrendPoint(
                    session_id=s["session_id"],
                    checked_at=s["checked_at"],
                    status=s["status"],
                    anomaly_score=s.get("anomaly_score"),
                    anomaly_type=s.get("anomaly_type"),
                    skipped=failed,
                )
            )
        valid = _valid_score_sessions(sessions, limit=5)
        trend_valid = [
            TrendPoint(
                session_id=s["session_id"],
                checked_at=s["checked_at"],
                status=s["status"],
                anomaly_score=s.get("anomaly_score"),
                anomaly_type=s.get("anomaly_type"),
            )
            for s in valid
        ]
        history: list[dict[str, Any]] = []
        for s in reversed(ordered):
            history.append(
                {
                    "session_id": s["session_id"],
                    "checked_at": s["checked_at"],
                    "status": s["status"],
                    "signal_quality": s.get("signal_quality"),
                    "anomaly_type": s.get("anomaly_type"),
                    "anomaly_title": s.get("anomaly_title"),
                    "anomaly_score": s.get("anomaly_score"),
                    "confidence": s.get("confidence"),
                }
            )
        return VehicleInsightResponse(
            vehicle=row,
            history=history,
            trend_points=trend_valid or trend,
            sessions_total=len(sessions),
        )