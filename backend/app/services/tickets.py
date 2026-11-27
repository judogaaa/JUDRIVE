from __future__ import annotations

import asyncio
import json
import logging


from app.agent.evidence import has_node_procedure, resolve_evidence_ids, references_allowed_for_engine, unsupported_claims
from app.rag.conflicts import inspection_only
from app.rag.catalog import MANUAL_SPECS
from app.rag.service import ManualRagService
from app.agent.guardrails import apply_engine_context, can_create_ticket, diagnosis_hash, urgency_allowed
from app.services.fleet import FleetService
from app.services.mock_clients import MockMlClient, MockToirClient
from app.storage.repository import AppRepository


logger = logging.getLogger(__name__)


class TicketService:
    def __init__(
        self,
        repo: AppRepository,
        fleet: FleetService,
        mock_ml: MockMlClient,
        mock_toir: MockToirClient,
        rag: ManualRagService | None = None,
    ) -> None:
        self._repo = repo
        self._fleet = fleet
        self._mock_ml = mock_ml
        self._mock_toir = mock_toir
        self._rag = rag

    async def confirm(self, draft_id: str, confirm_nonce: str, *,
                      warning_acknowledged: bool = False, urgency: str | None = None) -> dict:
        draft = self._repo.get_draft(draft_id)
        if not draft:
            return {"status": "error", "message": "Черновик не найден"}
        if draft["status"] == "unknown":
            return {
                "status": "unknown",
                "message": "Исход предыдущей отправки неизвестен. Повтор запрещён до ручной проверки.",
            }
        if draft["status"] != "draft":
            return {"status": "error", "message": f"Черновик в статусе {draft['status']}"}
        if draft["confirm_nonce"] != confirm_nonce:
            return {"status": "error", "message": "Неверный код подтверждения"}

        payload = json.loads(draft["payload_json"])
        vehicle_id = draft["vehicle_id"]
        session_id = draft["session_id"]

        if (payload.get("vehicle_id"), payload.get("session_id")) != (vehicle_id, session_id):
            return {"status": "refused", "message": "Контекст заявки не совпадает с черновиком"}
        if urgency is not None:
            payload["urgency"] = urgency
        if not isinstance(payload.get("urgency"), str) or not urgency_allowed(payload["urgency"]):
            return {"status": "refused", "message": "Недопустимый приоритет"}

        blocking = self._repo.has_blocking_submission(vehicle_id, session_id)
        if blocking and blocking["submit_status"] == "unknown":
            return {
                "status": "unknown",
                "message": "Исход отправки неизвестен. Повторная автоотправка запрещена.",
            }
        if blocking and blocking["submit_status"] in {"created", "sending"}:
            existing = next(
                (
                    row
                    for row in self._repo.list_tickets(vehicle_id)
                    if row.get("session_id") == session_id and row.get("ticket_id")
                ),
                None,
            )
            return {
                "status": "duplicate",
                "message": "Заявка по этой паре уже отправлялась или отправка ещё выполняется.",
                "ticket_id": existing["ticket_id"] if existing else None,
            }

        local_id = self._repo.claim_pair_sending(
            draft_id, vehicle_id, session_id, payload, confirm_nonce=confirm_nonce,
        )
        if not local_id:
            return {
                "status": "duplicate",
                "message": "Черновик устарел или заявка по этой проверке уже обрабатывается.",
            }

        try:
            diag = await self._mock_ml.diagnose(vehicle_id, session_id)
            apply_engine_context(diag, self._fleet.session_engine(vehicle_id, session_id))
        except (Exception, asyncio.CancelledError) as exc:
            # No TOiR call has been made: retry remains safe.
            self._repo.finish_submission(local_id, submit_status="failed", error_detail="ml_preflight", draft_status="draft")
            if isinstance(exc, asyncio.CancelledError):
                raise
            logger.warning("ML preflight failed: %s", type(exc).__name__)
            return {"status": "error", "message": "Не удалось перепроверить диагностику. Заявка не отправлена. Повторите подтверждение."}
        ok, reason = can_create_ticket(diag)
        if not ok:
            self._repo.finish_submission(local_id, submit_status="refused", error_detail=reason, draft_status="refused")
            return {"status": "refused", "message": reason}

        if diagnosis_hash(diag) != draft["diagnosis_hash"]:
            self._repo.finish_submission(local_id, submit_status="refused", error_detail="stale", draft_status="stale")
            return {
                "status": "stale",
                "message": "Диагностика изменилась с момента черновика. Подготовьте заявку заново.",
            }

        if diag.signal_quality == "warning" and warning_acknowledged is not True:
            self._repo.finish_submission(local_id, submit_status="failed", error_detail="warning_unacknowledged", draft_status="draft")
            return {"status": "warning_unacknowledged", "message": "Подтвердите, что учли помехи в записи."}

        if payload.get("anomaly_type") != diag.anomaly_type:
            self._repo.finish_submission(local_id, submit_status="refused", error_detail="anomaly_mismatch", draft_status="refused")
            return {"status": "refused", "message": "Код отклонения не совпадает с актуальной диагностикой"}

        try:
            if self._rag is None or not self._rag.status().get("index_current"):
                raise ValueError("manual index not current")
            if (diag.anomaly_type == "F01"
                    and not inspection_only(payload.get("operations", []), payload.get("spare_parts", []))
                    and self._rag.search(diag.engine_model, "тепловые зазоры клапанов").get("status") in {"conflict", "potential_conflict"}):
                raise ValueError("manual procedure conflict")
            ids = []
            for ref in payload.get("references", []):
                spec = next((s for s in MANUAL_SPECS if s.manual_title == ref["manual"]), None)
                if not spec:
                    raise ValueError("unknown manual")
                ids.append(f"{spec.doc_id}:p{int(ref['pdf_page']):04d}")
            resolved, errors = resolve_evidence_ids(self._rag, ids)
            claims = payload.get("operations", []) + payload.get("spare_parts", [])
            valid = bool(claims and not errors and references_allowed_for_engine(resolved, diag.engine_model)
                         and has_node_procedure(self._rag, resolved, diag.anomaly_type)
                         and not unsupported_claims(self._rag, resolved, claims))
            if not valid:
                raise ValueError("unsupported claims")
        except Exception:
            self._repo.finish_submission(local_id, submit_status="refused", error_detail="evidence_revalidation", draft_status="refused")
            return {"status": "refused", "message": "Источники или работы не подтверждены. Подготовьте новый черновик."}

        try:
            result = await self._mock_toir.create_ticket(payload)
        except (Exception, asyncio.CancelledError) as exc:
            # Once the POST starts, even malformed/5xx responses may mean it was accepted.
            self._repo.finish_submission(local_id, submit_status="unknown", error_detail=type(exc).__name__, draft_status="unknown")
            if isinstance(exc, asyncio.CancelledError):
                raise
            return {"status": "unknown", "message": "Исход отправки неизвестен. Повторная автоотправка запрещена."}

        ticket_id = result.get("ticket_id") if isinstance(result, dict) else None
        if not isinstance(ticket_id, str) or not ticket_id.startswith("TKT-"):
            self._repo.finish_submission(local_id, submit_status="unknown", error_detail="missing_ticket_id", draft_status="unknown")
            return {"status": "unknown", "message": "ТОиР не вернул номер заявки. Проверьте исход вручную."}
        self._repo.finish_submission(local_id, submit_status="created", ticket_id=ticket_id, draft_status="submitted")
        return {"status": "created", "ticket_id": ticket_id, "payload": payload}