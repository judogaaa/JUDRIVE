from __future__ import annotations

from app.rag.catalog import SPECS_BY_ID
from app.rag.service import ManualRagService


def resolve_evidence_ids(rag: ManualRagService, evidence_ids: list[str]) -> tuple[list[dict], list[str]]:
    resolved: list[dict] = []
    errors: list[str] = []
    for eid in evidence_ids[:8]:
        row = rag.get_evidence(eid)
        if not row:
            errors.append(f"Неизвестный evidence_id: {eid}")
            continue
        resolved.append(
            {
                "evidence_id": row["evidence_id"],
                "manual_title": row["manual_title"],
                "pdf_page": row["pdf_page"],
                "quote": (row["quote"] or "")[:600],
                "doc_id": row["doc_id"],
            }
        )
    return resolved, errors


def to_ticket_references(resolved: list[dict]) -> list[dict]:
    refs: list[dict] = []
    for item in resolved:
        title = item["manual_title"]
        refs.append({"manual": title, "pdf_page": int(item["pdf_page"])})
    return refs


def references_allowed_for_engine(resolved: list[dict], engine_model: str) -> bool:
    for item in resolved:
        doc_id = item.get("doc_id", "")
        spec = SPECS_BY_ID.get(doc_id)
        if not spec:
            return False
        if engine_model not in spec.engine_models:
            return False
    return bool(resolved)