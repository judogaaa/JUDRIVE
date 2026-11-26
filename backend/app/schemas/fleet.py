from pydantic import BaseModel, Field


class SessionSummary(BaseModel):
    session_id: str
    checked_at: str


class VehicleSummary(BaseModel):
    vehicle_id: str
    garage_no: str
    make: str
    model: str | None
    vehicle_type: str
    engine_model: str
    fuel: str
    sessions: list[SessionSummary] = Field(default_factory=list)
    latest_session_id: str | None = None
    latest_status: str | None = None
    latest_signal_quality: str | None = None


class DiagnosisHistoryPoint(BaseModel):
    session_id: str
    checked_at: str
    status: str
    anomaly_score: float | None = None
    anomaly_type: str | None = None
    skipped: bool = False


class VehicleDiagnosisHistory(BaseModel):
    vehicle_id: str
    trend_points: list[DiagnosisHistoryPoint] = Field(default_factory=list)