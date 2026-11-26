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