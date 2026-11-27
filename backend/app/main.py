from contextlib import asynccontextmanager
import json
from time import monotonic

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.agent.orchestrator import AgentOrchestrator
from app.auth.chief_session import clear_session, login as chief_login, require_chief, session_ok
from app.rag.catalog import MANUAL_SPECS
from app.config import get_settings
from app.rag.catalog import allowed_doc_ids
from app.rag.service import ManualRagService
from app.schemas.analytics import QuarantineRecommendationRequest
from app.schemas.chat import ChatMessageRequest, ConversationCreate
from app.agent.guardrails import apply_engine_context, sanitize_ml_observation
from app.schemas.diagnose import DiagnoseRequest, DiagnoseResponse
from app.schemas.fleet import VehicleDiagnosisHistory
from app.schemas.health import HealthResponse
from app.schemas.manuals import ManualSearchRequest, ManualSearchResponse, ManualSearchHit
from app.schemas.tickets import TicketConfirmRequest
from app.services.analytics import FleetAnalyticsService, diagnosis_review_priority
from app.services.fleet import FleetService
from app.services.mock_clients import MockMlClient, MockMlResponseError, MockToirClient
from app.services.tickets import TicketService
from app.services.voice import VoiceService
from app.services.usage_budget import UsageBudget
from app.services.gigachat import GigaChatAPI, GigaChatAPIError
from app.agent.locale import normalize_locale
from app.storage.repository import AppRepository

settings = get_settings()
fleet = FleetService(settings.fleet_data_path)
mock_ml = MockMlClient(settings.mock_ml_url)
mock_toir = MockToirClient(settings.mock_toir_url)
rag_service = ManualRagService(settings.db_path, settings.pdf_dir)
app_repo = AppRepository(settings.db_path)
gigachat_api = GigaChatAPI(
    settings.gigachat_credentials,
    scope=settings.gigachat_scope,
    base_url=settings.gigachat_base_url,
    auth_url=settings.gigachat_auth_url,
    timeout_s=settings.gigachat_timeout_s,
    ca_bundle=settings.gigachat_ca_bundle,
    budget=UsageBudget(settings),
)
agent = AgentOrchestrator(settings, fleet, mock_ml, rag_service, app_repo, gigachat_api)
ticket_service = TicketService(app_repo, fleet, mock_ml, mock_toir, rag_service)
fleet_analytics = FleetAnalyticsService(fleet, app_repo, settings.fleet_data_path)


def _build_voice_service(api: GigaChatAPI, current_settings, repository: AppRepository) -> VoiceService:
    def record_usage(usage: dict) -> None:
        repository.log_usage(
            None,
            int(usage.get("prompt_tokens", 0) or 0),
            int(usage.get("completion_tokens", 0) or 0),
            int(usage.get("total_tokens", 0) or 0),
            int(usage.get("latency_ms", 0) or 0),
            provider="gigachat",
            stage="voice_stt",
        )

    return VoiceService(
        api,
        current_settings.gigachat_stt_model,
        current_settings.gigachat_stt_timeout_s,
        on_usage=record_usage,
    )


voice_service = _build_voice_service(gigachat_api, settings, app_repo)


def _refresh_settings() -> None:
    global settings, fleet, mock_ml, mock_toir, rag_service, app_repo, gigachat_api, agent, ticket_service, fleet_analytics, voice_service
    get_settings.cache_clear()
    settings = get_settings()
    fleet = FleetService(settings.fleet_data_path)
    mock_ml = MockMlClient(settings.mock_ml_url)
    mock_toir = MockToirClient(settings.mock_toir_url)
    rag_service = ManualRagService(settings.db_path, settings.pdf_dir)
    app_repo = AppRepository(settings.db_path)
    gigachat_api = GigaChatAPI(
        settings.gigachat_credentials,
        scope=settings.gigachat_scope,
        base_url=settings.gigachat_base_url,
        auth_url=settings.gigachat_auth_url,
        timeout_s=settings.gigachat_timeout_s,
        ca_bundle=settings.gigachat_ca_bundle,
        budget=UsageBudget(settings),
    )
    agent = AgentOrchestrator(settings, fleet, mock_ml, rag_service, app_repo, gigachat_api)
    ticket_service = TicketService(app_repo, fleet, mock_ml, mock_toir, rag_service)
    fleet_analytics = FleetAnalyticsService(fleet, app_repo, settings.fleet_data_path)
    voice_service = _build_voice_service(gigachat_api, settings, app_repo)


@asynccontextmanager
async def lifespan(_: FastAPI):
    import asyncio

    _refresh_settings()
    app_repo.recover_interrupted_submissions()
    # Первая индексация может занять несколько минут при 6 PDF.
    await asyncio.to_thread(rag_service.ensure_index)
    yield


app = FastAPI(title="JUDRIVE API", lifespan=lifespan)

def _chief_guard(request: Request, response: Response) -> None:
    require_chief(request, get_settings())
    response.headers["Cache-Control"] = "private, no-store"


app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(f"{settings.api_prefix}/live")
async def live() -> dict:
    return {"status": "ok"}


_provider_probe: tuple[GigaChatAPI, float, bool] | None = None


async def _provider_available() -> bool:
    global _provider_probe
    if not gigachat_api.configured:
        return False
    now = monotonic()
    if _provider_probe and _provider_probe[0] is gigachat_api and now < _provider_probe[1]:
        return _provider_probe[2]
    try:
        models = await gigachat_api.request_json("GET", "/v1/models", timeout_s=3)
        available = any(
            isinstance(model, dict) and model.get("id") == settings.gigachat_model
            for model in (models.get("data") or [])
        )
    except (GigaChatAPIError, httpx.HTTPError):
        available = False
    _provider_probe = (gigachat_api, monotonic() + (60 if available else 10), available)
    return available


@app.get(f"{settings.api_prefix}/ready", response_model=HealthResponse)
async def ready(response: Response) -> HealthResponse:
    result = await health()
    if result.status != "ok":
        response.status_code = 503
    return result


@app.get(f"{settings.api_prefix}/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    try:
        ml_ok = await mock_ml.health()
    except httpx.HTTPError:
        ml_ok = False
    try:
        toir_ok = await mock_toir.health()
    except httpx.HTTPError:
        toir_ok = False
    rag_status = rag_service.status()
    rag_ok = rag_status.get("index_current") and not rag_status.get("missing_files")
    gigachat_ready = await _provider_available()
    status = "ok" if ml_ok and toir_ok and rag_ok and gigachat_ready else "degraded"
    return HealthResponse(
        status=status,
        mock_ml="up" if ml_ok else "down",
        mock_toir="up" if toir_ok else "down",
        manuals_index="ready" if rag_ok else "missing",
        gigachat_agent="ready" if gigachat_ready else ("unavailable" if gigachat_api.configured else "missing_key"),
    )


@app.get(f"{settings.api_prefix}/vehicles", dependencies=[Depends(_chief_guard)])
async def list_vehicles():
    return {"vehicles": fleet.list_vehicles()}


@app.get(f"{settings.api_prefix}/vehicles/{{vehicle_id}}/diagnosis-history", dependencies=[Depends(_chief_guard)], response_model=VehicleDiagnosisHistory)
async def vehicle_diagnosis_history(vehicle_id: str):
    if not fleet.vehicle_known(vehicle_id):
        raise HTTPException(status_code=404, detail="Транспорт не найден")
    return VehicleDiagnosisHistory(
        vehicle_id=vehicle_id,
        trend_points=fleet.diagnosis_trend(vehicle_id),
    )


@app.post(f"{settings.api_prefix}/diagnose", dependencies=[Depends(_chief_guard)], response_model=DiagnoseResponse)
async def diagnose(body: DiagnoseRequest) -> DiagnoseResponse:
    if not fleet.validate_pair(body.vehicle_id, body.session_id):
        raise HTTPException(
            status_code=404,
            detail="Неизвестная пара vehicle_id и session_id",
        )
    try:
        result = await mock_ml.diagnose(body.vehicle_id, body.session_id)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Проверка не ответила вовремя. Повторите запрос.") from exc
    except (httpx.HTTPError, MockMlResponseError) as exc:
        raise HTTPException(status_code=502, detail="Не удалось получить результат проверки. Повторите запрос.") from exc

    apply_engine_context(result, fleet.session_engine(body.vehicle_id, body.session_id))
    result.description = sanitize_ml_observation(result.description)
    result.review_priority = diagnosis_review_priority(fleet, result)
    return result


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


@app.get(f"{settings.api_prefix}/manuals/catalog", dependencies=[Depends(_chief_guard)])
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


@app.get(f"{settings.api_prefix}/manuals/status", dependencies=[Depends(_chief_guard)])
async def manuals_status():
    status = rag_service.status()
    return {key: status[key] for key in ("index_current", "documents", "pages", "missing_files")}


@app.post(f"{settings.api_prefix}/manuals/search", dependencies=[Depends(_chief_guard)], response_model=ManualSearchResponse)
async def manuals_search(body: ManualSearchRequest, response: Response) -> ManualSearchResponse:
    import asyncio

    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    engine = _document_engine(body.engine_model, body.vehicle_id, body.session_id)
    payload = await asyncio.to_thread(rag_service.search, engine, body.query, limit=body.limit)
    hits = [ManualSearchHit.model_validate(item) for item in payload.get("results", [])]
    return ManualSearchResponse(
        status=payload["status"],
        engine_model=payload.get("engine_model"),
        query=payload.get("query"),
        message=payload.get("message"),
        manuals=payload.get("manuals"),
        missing_files=payload.get("missing_files"),
        results=hits,
        conflicting_sources=payload.get("conflicting_sources", []),
    )


def _document_engine(engine_model: str, vehicle_id: str | None, session_id: str | None) -> str:
    if vehicle_id is not None or session_id is not None:
        if not vehicle_id or not session_id or fleet.session_engine(vehicle_id, session_id) != engine_model:
            raise HTTPException(status_code=404, detail="Источник недоступен для этой проверки")
    return engine_model


@app.get(f"{settings.api_prefix}/sources/evidence/{{evidence_id}}", dependencies=[Depends(_chief_guard)])
async def get_source_evidence(evidence_id: str, response: Response, engine_model: str,
                              vehicle_id: str | None = None, session_id: str | None = None):
    engine = _document_engine(engine_model, vehicle_id, session_id)
    if evidence_id.split(":")[0] not in allowed_doc_ids(engine):
        raise HTTPException(status_code=404, detail="Источник недоступен")
    evidence = rag_service.get_evidence(evidence_id)
    if not evidence or evidence["doc_id"] not in allowed_doc_ids(engine) or not rag_service.resolve_pdf_path(evidence["doc_id"]):
        raise HTTPException(status_code=404, detail="Источник недоступен")
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    return {key: value for key, value in evidence.items() if key != "filename"}


@app.get(f"{settings.api_prefix}/sources/pdf/{{doc_id}}", dependencies=[Depends(_chief_guard)])
async def get_source_pdf(doc_id: str, engine_model: str,
                         vehicle_id: str | None = None, session_id: str | None = None):
    if doc_id not in allowed_doc_ids(_document_engine(engine_model, vehicle_id, session_id)):
        raise HTTPException(status_code=404, detail="Неизвестный документ")
    path = rag_service.resolve_pdf_path(doc_id)
    if not path:
        raise HTTPException(status_code=404, detail="Файл PDF не найден на диске")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{doc_id}.pdf",
        content_disposition_type="inline",
        headers={"Accept-Ranges": "bytes", "Cache-Control": "private, no-store",
                 "Cross-Origin-Resource-Policy": "same-origin"},
    )


@app.post(f"{settings.api_prefix}/conversations", dependencies=[Depends(_chief_guard)])
async def create_conversation(body: ConversationCreate):
    return agent.create_conversation(body.vehicle_id, body.session_id)


@app.get(f"{settings.api_prefix}/conversations/{{conversation_id}}/messages", dependencies=[Depends(_chief_guard)])
async def conversation_messages(conversation_id: str, response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    return {"messages": agent.get_conversation_messages(conversation_id)}


@app.post(f"{settings.api_prefix}/conversations/{{conversation_id}}/messages", dependencies=[Depends(_chief_guard)])
async def conversation_send(conversation_id: str, body: ChatMessageRequest, response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    return await agent.send_message(
        conversation_id,
        body.message,
        locale=body.locale,
        analysis_only=body.analysis_only,
        action=body.action,
        evidence_id=body.evidence_id,
    )


@app.post(f"{settings.api_prefix}/voice/transcribe", dependencies=[Depends(_chief_guard)])
async def voice_transcribe(
    file: UploadFile = File(...),
    locale: str = Form(default="ru"),
):
    return await voice_service.transcribe(file, language=normalize_locale(locale))


@app.get(f"{settings.api_prefix}/tickets/drafts/{{draft_id}}", dependencies=[Depends(_chief_guard)])
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


@app.post(f"{settings.api_prefix}/tickets/drafts/{{draft_id}}/confirm", dependencies=[Depends(_chief_guard)])
async def confirm_ticket_draft(draft_id: str, body: TicketConfirmRequest):
    if not body.acknowledge:
        raise HTTPException(status_code=400, detail="Требуется явное подтверждение")
    return await ticket_service.confirm(draft_id, body.confirm_nonce, warning_acknowledged=body.warning_acknowledged, urgency=body.urgency)


@app.get(f"{settings.api_prefix}/tickets", dependencies=[Depends(_chief_guard)])
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


@app.post(f"{settings.api_prefix}/fleet/vehicles/{{vehicle_id}}/quarantine-recommendation")
async def set_quarantine_recommendation(vehicle_id: str, body: QuarantineRecommendationRequest,
                                        _: None = Depends(_chief_guard)):
    insight = fleet_analytics.vehicle_insight(vehicle_id)
    if insight is None:
        raise HTTPException(status_code=404, detail="Транспорт не найден")
    row = insight.vehicle
    if not body.acknowledge or len(body.reason.strip()) < 10:
        raise HTTPException(status_code=400, detail="Требуется явное подтверждение и обоснование")
    if row.latest_session_id != body.session_id:
        raise HTTPException(status_code=409, detail="Выбрана устаревшая проверка")
    if body.active:
        # A new recommendation is only tied to a current, valid abnormal check.
        if row.latest_status != "anomaly" or row.needs_rerecord:
            raise HTTPException(status_code=409, detail="Нет пригодной аномальной проверки")
    app_repo.record_quarantine_recommendation(vehicle_id, body.session_id, body.active,
                                               body.reason.strip(), get_settings().chief_username or "")
    return fleet_analytics.vehicle_insight(vehicle_id)
