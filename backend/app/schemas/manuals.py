from pydantic import BaseModel, Field


class ManualSearchRequest(BaseModel):
    engine_model: str = Field(min_length=1)
    vehicle_id: str | None = None
    session_id: str | None = None
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=5, ge=1, le=20)


class ManualSearchHit(BaseModel):
    evidence_id: str
    doc_id: str
    manual_title: str
    pdf_page: int = Field(ge=1)
    quote: str
    score: float
    extraction: str
    applicability: str | None = None


class ManualSearchResponse(BaseModel):
    status: str
    engine_model: str | None = None
    query: str | None = None
    message: str | None = None
    manuals: list[str] | None = None
    missing_files: list[str] | None = None
    conflicting_sources: list[ManualSearchHit] = Field(default_factory=list)
    results: list[ManualSearchHit] = Field(default_factory=list)