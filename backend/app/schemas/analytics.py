from typing import Literal

from pydantic import BaseModel, Field

FleetCategory = Literal["normal", "attention", "quarantine"]
UrgencyBand = Literal["low", "medium", "high"]


class TrendPoint(BaseModel):
    session_id: str
    checked_at: str
    status: str
    anomaly_score: float | None = None
    anomaly_type: str | None = None
    skipped: bool = False


class EarlyWarning(BaseModel):
    code: str
    message: str


class VehicleFleetRow(BaseModel):
    vehicle_id: str
    garage_no: str
    make: str
    model: str | None
    vehicle_type: str
    engine_model: str
    category: FleetCategory
    priority_score: int
    urgency_band: UrgencyBand | None = None
    latest_session_id: str
    latest_checked_at: str
    latest_status: str
    signal_quality: str
    anomaly_type: str | None = None
    anomaly_title: str | None = None
    anomaly_score: float | None = None
    confidence: float | None = None
    category_reason: str
    needs_rerecord: bool = False
    quarantine_basis: str | None = None
    quarantine_recommended: bool = False
    quarantine_confirmed: bool = False
    early_warnings: list[EarlyWarning] = Field(default_factory=list)
    ticket_id: str | None = None


class FleetSessionStats(BaseModel):
    total_sessions: int
    by_status: dict[str, int]
    by_signal_quality: dict[str, int]
    by_engine_model: dict[str, int]
    by_anomaly_type: dict[str, int]
    latest_by_status: dict[str, int]


class FleetDashboardResponse(BaseModel):
    synthetic: bool = True
    vehicle_count: int
    session_stats: FleetSessionStats
    summary: dict[str, int]
    priority_queue: list[VehicleFleetRow]
    vehicles: list[VehicleFleetRow]
    early_warnings_fleet: list[dict[str, str]]
    engine_models: list[str] = Field(default_factory=list)
    vehicle_types: list[str] = Field(default_factory=list)


class VehicleInsightResponse(BaseModel):
    vehicle: VehicleFleetRow
    history: list[dict]
    trend_points: list[TrendPoint]
    sessions_total: int

class QuarantineRecommendationRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)
    active: bool
    reason: str = Field(min_length=10, max_length=500)
    acknowledge: bool
