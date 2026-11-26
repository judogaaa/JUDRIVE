from typing import Literal

from pydantic import BaseModel, Field


class DiagnoseRequest(BaseModel):
    vehicle_id: str = Field(min_length=1)
    session_id: str = Field(min_length=1)


class DiagnoseResponse(BaseModel):
    vehicle_id: str
    session_id: str
    status: Literal["normal", "anomaly", "check_failed"]
    anomaly_type: str | None
    anomaly_title: str | None
    anomaly_score: float | None = Field(ge=0, le=1)
    confidence: float | None = Field(ge=0, le=1)
    signal_quality: Literal["good", "warning", "bad"]
    description: str
    model_version: str
    engine_model: str | None = None