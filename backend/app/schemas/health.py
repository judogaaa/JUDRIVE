from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    mock_ml: str
    mock_toir: str