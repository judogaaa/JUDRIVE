from contextlib import asynccontextmanager
import json

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.agent.orchestrator import AgentOrchestrator
from app.auth.chief_session import clear_session, login as chief_login, require_chief, session_ok
from app.rag.catalog import MANUAL_SPECS
from app.config import get_settings
from app.rag.catalog import SPECS_BY_ID
from app.rag.service import ManualRagService
from app.schemas.chat import ChatMessageRequest, ConversationCreate
from app.schemas.diagnose import DiagnoseRequest, DiagnoseResponse
from app.schemas.health import HealthResponse
from app.schemas.manuals import ManualSearchRequest, ManualSearchResponse, ManualSearchHit
from app.schemas.tickets import TicketConfirmRequest
from app.services.analytics import FleetAnalyticsService
from app.services.fleet import FleetService
from app.services.mock_clients import MockMlClient, MockToirClient
from app.services.tickets import TicketService
from app.services.voice import VoiceService
from app.agent.locale import WHISPER_LANG, normalize_locale
from app.storage.repository import AppRepository

settings = get_settings()
fleet = FleetService(settings.fleet_data_path)
mock_ml = MockMlClient(settings.mock_ml_url)
mock_toir = MockToirClient(settings.mock_toir_url)
rag_service = ManualRagService(settings.db_path, settings.pdf_dir)
app_repo = AppRepository(settings.db_path)
agent = AgentOrchestrator(settings, fleet, mock_ml, rag_service, app_repo)
ticket_service = TicketService(app_repo, fleet, mock_ml, mock_toir)
fleet_analytics = FleetAnalyticsService(fleet, app_repo, settings.fleet_data_path)
voice_service = VoiceService(settings.groq_api_key, settings.groq_stt_model, settings.groq_stt_timeout_s)


def _refresh_settings() -> None:
    global settings, fleet, mock_ml, mock_toir, rag_service, app_repo, agent, ticket_service, fleet_analytics, voice_service
    get_settings.cache_clear()
    settings = get_settings()
    fleet = FleetService(settings.fleet_data_path)
    mock_ml = MockMlClient(settings.mock_ml_url)
    mock_toir = MockToirClient(settings.mock_toir_url)
    rag_service = ManualRagService(settings.db_path, settings.pdf_dir)
    app_repo = AppRepository(settings.db_path)
    agent = AgentOrchestrator(settings, fleet, mock_ml, rag_service, app_repo)
    ticket_service = TicketService(app_repo, fleet, mock_ml, mock_toir)
    fleet_analytics = FleetAnalyticsService(fleet, app_repo, settings.fleet_data_path)
    voice_service = VoiceService(settings.groq_api_key, settings.groq_stt_model, settings.groq_stt_timeout_s)


@asynccontextmanager
async def lifespan(_: FastAPI):
    import asyncio

    _refresh_settings()
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
    groq_ready = bool(settings.groq_api_key)
    status = "ok" if ml_ok and toir_ok and rag_ok and groq_ready else "degraded"
    return HealthResponse(
        status=status,
        mock_ml="up" if ml_ok else "down",
        mock_toir="up" if toir_ok else "down",
        manuals_index="ready" if rag_ok else "missing",
        groq_agent="configured" if groq_ready else "missing_key",
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


def _chief_guard(request: Request) -> None:
    require_chief(request, get_settings())


@app.post(f"{settings.api_prefix}/auth/login")
async def auth_login(request: Request, response: Response, body: dict):
    username = str(body.get("username") or "")
    password = str(body.get("password") or "")
    chief_login(request, response, get_settings(), username, password)
    return {"ok": True}


@app.post(f"{settings.api_prefix}/auth/logout")
async def auth_logout(response: Response):
    clear_session(response, get_settings())
    return {"ok": True}


@app.get(f"{settings.api_prefix}/auth/session")
async def auth_session(request: Request):
    return {"authenticated": session_ok(request, get_settings())}


@app.get(f"{settings.api_prefix}/manuals/catalog")
async def manuals_catalog():
    groups: dict[str, list[dict[str, str | int]]] = {}
    for spec in MANUAL_SPECS:
        for engine in spec.engine_models:
            groups.setdefault(engine, []).append(
                {
                    "doc_id": spec.doc_id,
                    "title": spec.manual_title,
                    "pages": spec.expected_pages,
                }
            )
    return {"engines": [{"engine_model": engine, "documents": docs} for engine, docs in groups.items()]}


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
        content_disposition_type="inline",
        headers={"Accept-Ranges": "bytes"},
    )


@app.post(f"{settings.api_prefix}/conversations")
async def create_conversation(body: ConversationCreate):
    return agent.create_conversation(body.vehicle_id, body.session_id)


@app.get(f"{settings.api_prefix}/conversations/{{conversation_id}}/messages")
async def conversation_messages(conversation_id: str):
    return {"messages": agent.get_conversation_messages(conversation_id)}


@app.post(f"{settings.api_prefix}/conversations/{{conversation_id}}/messages")
async def conversation_send(conversation_id: str, body: ChatMessageRequest):
    return await agent.send_message(conversation_id, body.message, locale=body.locale)


@app.post(f"{settings.api_prefix}/voice/transcribe")
async def voice_transcribe(
    file: UploadFile = File(...),
    locale: str = Form(default="ru"),
):
    lang = WHISPER_LANG.get(normalize_locale(locale))
    return await voice_service.transcribe(file, language=lang)


@app.get(f"{settings.api_prefix}/tickets/drafts/{{draft_id}}")
async def get_ticket_draft(draft_id: str):
    draft = app_repo.get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Черновик не найден")
    return {
        "draft_id": draft["draft_id"],
        "status": draft["status"],
        "version": draft["version"],
        "confirm_nonce": draft["confirm_nonce"],
        "payload": json.loads(draft["payload_json"]),
    }


@app.post(f"{settings.api_prefix}/tickets/drafts/{{draft_id}}/confirm")
async def confirm_ticket_draft(draft_id: str, body: TicketConfirmRequest):
    if not body.acknowledge:
        raise HTTPException(status_code=400, detail="Требуется явное подтверждение")
    return await ticket_service.confirm(draft_id, body.confirm_nonce)


@app.get(f"{settings.api_prefix}/tickets")
async def list_submitted_tickets(vehicle_id: str | None = None):
    return {"tickets": app_repo.list_tickets(vehicle_id)}


@app.get(f"{settings.api_prefix}/fleet/dashboard")
async def fleet_dashboard(
    _: None = Depends(_chief_guard),
    category: str | None = None,
    engine_model: str | None = None,
    vehicle_type: str | None = None,
    q: str | None = None,
):
    return fleet_analytics.dashboard(
        category=category,
        engine_model=engine_model,
        vehicle_type=vehicle_type,
        query=q,
    )


@app.get(f"{settings.api_prefix}/fleet/vehicles/{{vehicle_id}}/insight")
async def fleet_vehicle_insight(vehicle_id: str, _: None = Depends(_chief_guard)):
    insight = fleet_analytics.vehicle_insight(vehicle_id)
    if insight is None:
        raise HTTPException(status_code=404, detail="Транспорт не найден")
    return insight