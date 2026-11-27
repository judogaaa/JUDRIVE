from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from app.agent.evidence import has_node_procedure, references_allowed_for_engine, resolve_evidence_ids, to_ticket_references, unsupported_claims
from app.agent.guardrails import apply_engine_context, can_create_ticket, diagnosis_hash, ml_facts_for_agent, urgency_allowed
from app.rag.conflicts import inspection_only
from app.rag.service import AGENT_SEARCH_LIMIT, ManualRagService
from app.services.analytics import diagnosis_review_priority
from app.services.fleet import FleetService
from app.services.mock_clients import MockMlClient
from app.storage.repository import AppRepository

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_diagnosis",
            "description": "Получить актуальный результат Mock ML для выбранной в сессии пары ТС/проверка.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vehicle_history",
            "description": "История акустических проверок и отправленных заявок текущей машины (не история выполненных ремонтов).",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_manuals",
            "description": "Поиск по руководствам РЭ/РК для двигателя текущей машины (двигатель задаёт сервер).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Технический поисковый запрос на русском"},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "prepare_defect_ticket",
            "description": "Подготовить черновик заявки ТОиР v6 из подтверждённых фактов. Не отправляет заявку.",
            "parameters": {
                "type": "object",
                "properties": {
                    "conclusion": {"type": "string"},
                    "urgency": {"type": "string", "enum": ["low", "medium", "high"]},
                    "operations": {"type": "array", "items": {"type": "string"}, "minItems": 1},
                    "spare_parts": {"type": "array", "items": {"type": "string"}},
                    "evidence_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "description": "ID страниц из search_manuals (evidence_id)",
                    },
                },
                "required": ["conclusion", "urgency", "operations", "evidence_ids"],
                "additionalProperties": False,
            },
        },
    },
]


@dataclass(slots=True)
class ToolRuntime:
    fleet: FleetService
    mock_ml: MockMlClient
    rag: ManualRagService
    repo: AppRepository
    vehicle_id: str
    session_id: str
    engine_model: str
    conversation_id: str
    analysis_only: bool = False
    diagnosis: Any | None = None
    sources: list[dict] = field(default_factory=list)
    draft: dict | None = None
    conflict: dict | None = None

    async def execute(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if name == "get_diagnosis":
            return await self._get_diagnosis()
        if name == "get_vehicle_history":
            return self._get_vehicle_history()
        if name == "search_manuals":
            return await asyncio.to_thread(self._search_manuals, arguments.get("query", ""))
        if name == "prepare_defect_ticket":
            return await self._prepare_ticket(arguments)
        return {"error": f"Неизвестный инструмент: {name}"}

    async def _get_diagnosis(self) -> dict[str, Any]:
        if self.diagnosis is None:
            self.diagnosis = await self.mock_ml.diagnose(self.vehicle_id, self.session_id)
            apply_engine_context(self.diagnosis, self.engine_model)
            self.diagnosis.review_priority = diagnosis_review_priority(self.fleet, self.diagnosis)
        return ml_facts_for_agent(self.diagnosis, self.engine_model)

    def _get_vehicle_history(self) -> dict[str, Any]:
        tickets = []
        for row in self.repo.list_tickets(self.vehicle_id):
            if row.get("submit_status") != "created" or not row.get("ticket_id"):
                continue
            payload = json.loads(row["payload_snapshot"] or "{}")
            tickets.append({"ticket_id": row["ticket_id"], "session_id": row["session_id"],
                            "status": "created", "conclusion": payload.get("conclusion"),
                            "operations": payload.get("operations"), "references": payload.get("references")})
            if len(tickets) >= 5:
                break
        return {
            "submitted_tickets": tickets,
            "ticket_note": "Заявка создана, выполнение ремонта не подтверждено.",
            "vehicle_id": self.vehicle_id,
            "engine_model": self.engine_model,
            "sessions": self.fleet.vehicle_history(self.vehicle_id),
        }

    def _search_manuals(self, query: str) -> dict[str, Any]:
        if not isinstance(query, str) or not query.strip() or len(query) > 500:
            return {"status": "invalid_query", "message": "Пустой запрос"}
        result = self.rag.search(self.engine_model, query.strip(), limit=AGENT_SEARCH_LIMIT)
        if result["status"] in {"conflict", "potential_conflict"}:
            self.conflict = result
        if result.get("results"):
            for hit in result["results"]:
                self.sources.append(hit)
        return result

    async def _prepare_ticket(self, args: dict[str, Any]) -> dict[str, Any]:
        if self.analysis_only:
            return {
                "status": "refused",
                "message": "В текущем режиме можно только просматривать данные",
            }
        if self.diagnosis is None:
            await self._get_diagnosis()
        assert self.diagnosis is not None
        ok, reason = can_create_ticket(self.diagnosis)
        if not ok:
            return {"status": "refused", "message": reason}

        if not urgency_allowed(args.get("urgency", "")):
            return {"status": "refused", "message": "Некорректный urgency"}

        for field in ("operations", "spare_parts", "evidence_ids"):
            value = args.get(field, [])
            if not isinstance(value, list) or len(value) > 12 or any(not isinstance(x, str) or len(x) > 500 for x in value):
                return {"status": "refused", "message": "Некорректный формат или слишком длинный список"}
        operations = [str(x).strip() for x in args.get("operations", []) if str(x).strip()]
        if not operations:
            return {"status": "refused", "message": "Нужен непустой список работ"}

        evidence_ids = [str(x) for x in args.get("evidence_ids", []) if str(x)]
        known = {str(hit.get("evidence_id")) for hit in self.sources}
        if not evidence_ids or any(eid not in known for eid in evidence_ids):
            return {
                "status": "refused",
                "message": "Источник не из результатов search_manuals этого диалога",
            }
        resolved, errors = resolve_evidence_ids(self.rag, evidence_ids)
        if errors or not resolved:
            return {"status": "refused", "message": "Нет подтверждённых источников", "errors": errors}
        if not references_allowed_for_engine(resolved, self.engine_model):
            return {"status": "refused", "message": "Источник не относится к двигателю машины"}

        if not has_node_procedure(self.rag, resolved, self.diagnosis.anomaly_type):
            return {"status": "refused", "message": "В источниках нет процедуры для этого узла. Нужна дефектовка."}

        spare_parts = [str(x).strip() for x in args.get("spare_parts", []) if str(x).strip()]
        if self.diagnosis.anomaly_type == "F01" and not self.conflict:
            await self.execute("search_manuals", {"query": "тепловые зазоры клапанов"})
        if self.conflict and not inspection_only(operations, spare_parts):
            return {"status": "refused", "message": "Источники расходятся. Допустим только осмотр без спорных нормативов."}
        missing = unsupported_claims(self.rag, resolved, operations + spare_parts)
        if missing:
            return {"status": "refused", "message": "Работы или запчасти не подтверждены указанными страницами. Уточните формулировку по тексту источника.", "unsupported": missing}
        references = to_ticket_references(resolved)
        payload = {
            "vehicle_id": self.vehicle_id,
            "session_id": self.session_id,
            "anomaly_type": self.diagnosis.anomaly_type,
            "conclusion": f"Возможное отклонение {self.diagnosis.anomaly_type}: {self.diagnosis.anomaly_title or 'требуется проверка'}. Требуется подтверждение специалистом.",
            "urgency": diagnosis_review_priority(self.fleet, self.diagnosis) or "medium",
            "operations": operations,
            "spare_parts": spare_parts,
            "references": references,
        }
        dhash = diagnosis_hash(self.diagnosis)
        draft = self.repo.save_draft(
            self.conversation_id,
            self.vehicle_id,
            self.session_id,
            dhash,
            payload,
        )
        draft["resolved_evidence"] = resolved
        draft["signal_quality"] = self.diagnosis.signal_quality
        self.draft = draft
        return {
            "status": "draft_ready",
            "draft_id": draft["draft_id"],
            "confirm_nonce": draft["confirm_nonce"],
            "version": draft["version"],
            "payload": payload,
            "message": "Черновик создан. Отправка только после явного подтверждения механиком.",
        }