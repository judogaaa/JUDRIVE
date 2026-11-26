from __future__ import annotations

import json
import sqlite3

import httpx

from app.agent.guardrails import can_create_ticket, diagnosis_hash
from app.services.fleet import FleetService
from app.services.mock_clients import MockMlClient, MockToirClient
from app.storage.repository import AppRepository


class TicketService:
    def __init__(
        self,
        repo: AppRepository,
        fleet: FleetService,
        mock_ml: MockMlClient,
        mock_toir: MockToirClient,
    ) -> None:
        self._repo = repo
        self._fleet = fleet
        self._mock_ml = mock_ml
        self._mock_toir = mock_toir

    async def confirm(self, draft_id: str, confirm_nonce: str) -> dict:
        draft = self._repo.get_draft(draft_id)
        if not draft:
            return {"status": "error", "message": "Черновик не найден"}
        if draft["status"] != "draft":
            return {"status": "error", "message": f"Черновик в статусе {draft['status']}"}
        if draft["confirm_nonce"] != confirm_nonce:
            return {"status": "error", "message": "Неверный код подтверждения"}

        payload = json.loads(draft["payload_json"])
        vehicle_id = draft["vehicle_id"]
        session_id = draft["session_id"]

        if self._repo.has_submitted_ticket(vehicle_id, session_id):
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
                "message": "Заявка по этой паре уже отправлялась.",
                "ticket_id": existing["ticket_id"] if existing else None,
            }

        diag = await self._mock_ml.diagnose(vehicle_id, session_id)
        diag.engine_model = self._fleet.session_engine(vehicle_id, session_id)
        ok, reason = can_create_ticket(diag)
        if not ok:
            self._repo.record_submission(
                draft_id,
                vehicle_id,
                session_id,
                ticket_id=None,
                submit_status="refused",
                payload_snapshot=payload,
                error_detail=reason,
            )
            return {"status": "refused", "message": reason}

        if diagnosis_hash(diag) != draft["diagnosis_hash"]:
            return {
                "status": "stale",
                "message": "Диагностика изменилась с момента черновика. Подготовьте заявку заново.",
            }

        if payload.get("anomaly_type") != diag.anomaly_type:
            return {"status": "refused", "message": "anomaly_type не совпадает с актуальной диагностикой"}

        try:
            result = await self._mock_toir.create_ticket(payload)
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text
            self._repo.record_submission(
                draft_id,
                vehicle_id,
                session_id,
                ticket_id=None,
                submit_status="failed",
                payload_snapshot=payload,
                error_detail=detail,
            )
            return {"status": "failed", "message": "Ошибка Mock ТОиР", "detail": detail}
        except httpx.HTTPError:
            self._repo.record_submission(
                draft_id,
                vehicle_id,
                session_id,
                ticket_id=None,
                submit_status="unknown",
                payload_snapshot=payload,
                error_detail="network_error",
            )
            return {
                "status": "unknown",
                "message": "Исход отправки неизвестен. Повторная автоотправка запрещена.",
            }

        ticket_id = result.get("ticket_id")
        self._repo.mark_draft_submitted(draft_id)
        try:
            self._repo.record_submission(
                draft_id,
                vehicle_id,
                session_id,
                ticket_id=ticket_id,
                submit_status="created",
                payload_snapshot=payload,
            )
        except sqlite3.IntegrityError:
            return {
                "status": "duplicate",
                "message": "Заявка по этой паре уже зафиксирована.",
                "ticket_id": ticket_id,
            }
        return {"status": "created", "ticket_id": ticket_id, "payload": payload}