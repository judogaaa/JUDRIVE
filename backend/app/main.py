from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.schemas.diagnose import DiagnoseRequest, DiagnoseResponse
from app.schemas.health import HealthResponse
from app.services.fleet import FleetService
from app.services.mock_clients import MockMlClient, MockToirClient

settings = get_settings()
fleet = FleetService(settings.fleet_data_path)
mock_ml = MockMlClient(settings.mock_ml_url)
mock_toir = MockToirClient(settings.mock_toir_url)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="JUDRIVE API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(f"{settings.api_prefix}/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    ml_ok = await mock_ml.health()
    toir_ok = await mock_toir.health()
    status = "ok" if ml_ok and toir_ok else "degraded"
    return HealthResponse(
        status=status,
        mock_ml="up" if ml_ok else "down",
        mock_toir="up" if toir_ok else "down",
    )


@app.get(f"{settings.api_prefix}/vehicles")
async def list_vehicles():
    return {"vehicles": fleet.list_vehicles()}


@app.post(f"{settings.api_prefix}/diagnose", response_model=DiagnoseResponse)
async def diagnose(body: DiagnoseRequest) -> DiagnoseResponse:
    if not fleet.validate_pair(body.vehicle_id, body.session_id):
        raise HTTPException(
            status_code=404,
            detail="Неизвестная пара vehicle_id и session_id",
        )
    try:
        result = await mock_ml.diagnose(body.vehicle_id, body.session_id)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Mock ML недоступен") from exc

    result.engine_model = fleet.session_engine(body.vehicle_id, body.session_id)
    return result