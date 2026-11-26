from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import get_settings
from app.rag.catalog import SPECS_BY_ID
from app.rag.service import ManualRagService
from app.schemas.diagnose import DiagnoseRequest, DiagnoseResponse
from app.schemas.health import HealthResponse
from app.schemas.manuals import ManualSearchRequest, ManualSearchResponse, ManualSearchHit
from app.services.fleet import FleetService
from app.services.mock_clients import MockMlClient, MockToirClient

settings = get_settings()
fleet = FleetService(settings.fleet_data_path)
mock_ml = MockMlClient(settings.mock_ml_url)
mock_toir = MockToirClient(settings.mock_toir_url)
rag_service = ManualRagService(settings.db_path, settings.pdf_dir)


@asynccontextmanager
async def lifespan(_: FastAPI):
    import asyncio

    # Первая индексация может занять несколько минут при 6 PDF.
    await asyncio.to_thread(rag_service.ensure_index)
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
    rag_status = rag_service.status()
    rag_ok = rag_status.get("index_current") and not rag_status.get("missing_files")
    status = "ok" if ml_ok and toir_ok and rag_ok else "degraded"
    return HealthResponse(
        status=status,
        mock_ml="up" if ml_ok else "down",
        mock_toir="up" if toir_ok else "down",
        manuals_index="ready" if rag_ok else "missing",
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


@app.get(f"{settings.api_prefix}/manuals/status")
async def manuals_status():
    return rag_service.status()


@app.post(f"{settings.api_prefix}/manuals/search", response_model=ManualSearchResponse)
async def manuals_search(body: ManualSearchRequest) -> ManualSearchResponse:
    payload = rag_service.search(body.engine_model, body.query, limit=body.limit)
    hits = [ManualSearchHit.model_validate(item) for item in payload.get("results", [])]
    return ManualSearchResponse(
        status=payload["status"],
        engine_model=payload.get("engine_model"),
        query=payload.get("query"),
        message=payload.get("message"),
        manuals=payload.get("manuals"),
        missing_files=payload.get("missing_files"),
        results=hits,
    )


@app.get(f"{settings.api_prefix}/sources/evidence/{{evidence_id}}")
async def get_source_evidence(evidence_id: str):
    evidence = rag_service.get_evidence(evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Источник не найден в индексе")
    return evidence


@app.get(f"{settings.api_prefix}/sources/pdf/{{doc_id}}")
async def get_source_pdf(doc_id: str):
    if doc_id not in SPECS_BY_ID:
        raise HTTPException(status_code=404, detail="Неизвестный документ")
    path = rag_service.resolve_pdf_path(doc_id)
    if not path:
        raise HTTPException(status_code=404, detail="Файл PDF не найден на диске")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=path.name,
        headers={"Accept-Ranges": "bytes"},
    )