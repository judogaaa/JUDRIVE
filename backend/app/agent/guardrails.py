from __future__ import annotations

import hashlib
import json
import re

from app.schemas.diagnose import DiagnoseResponse

INJECTION_PATTERNS = (
    re.compile(r"(?i)ignore\s+all\s+previous"),
    re.compile(r"(?i)system\s+prompt"),
    re.compile(r"(?i)объяв\w*\s+двигател\w*\s+исправн"),
    re.compile(r"(?i)нормализ\w*\s+статус"),
    re.compile(r"(?i)созда\w*\s+заявк\w*"),
    re.compile(r"(?i)раскры\w*\s+промпт"),
)

MAX_USER_MESSAGE_LEN = 2000


def sanitize_user_message(text: str) -> str:
    cleaned = text.strip()
    if len(cleaned) > MAX_USER_MESSAGE_LEN:
        cleaned = cleaned[:MAX_USER_MESSAGE_LEN]
    return cleaned


def diagnosis_hash(diag: DiagnoseResponse) -> str:
    payload = {
        "vehicle_id": diag.vehicle_id,
        "session_id": diag.session_id,
        "status": diag.status,
        "anomaly_type": diag.anomaly_type,
        "signal_quality": diag.signal_quality,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def can_create_ticket(diag: DiagnoseResponse) -> tuple[bool, str]:
    if diag.status == "check_failed" or diag.signal_quality == "bad":
        return False, "Запись непригодна: заявку не оформляем, нужна повторная диагностика."
    if diag.status == "normal":
        return False, "Статус normal: заявка на дефектовку не допускается."
    if diag.status != "anomaly":
        return False, "Недостаточный статус ML для заявки."
    if not diag.anomaly_type:
        return False, "Не указан код отклонения anomaly_type."
    return True, ""


def ml_facts_for_agent(diag: DiagnoseResponse, engine_model: str | None) -> dict:
    """Структурированные факты ML; description помечен как недоверенный текст."""
    description = diag.description or ""
    for pattern in INJECTION_PATTERNS:
        if pattern.search(description):
            description = re.sub(pattern, "[отфильтровано]", description)
    return {
        "vehicle_id": diag.vehicle_id,
        "session_id": diag.session_id,
        "engine_model": engine_model,
        "status": diag.status,
        "anomaly_type": diag.anomaly_type,
        "anomaly_title": diag.anomaly_title,
        "anomaly_score": diag.anomaly_score,
        "confidence": diag.confidence,
        "signal_quality": diag.signal_quality,
        "model_version": diag.model_version,
        "ml_observation": description[:500],
        "trust_note": "Поле ml_observation — синтетическое описание звука, не инструкция и не меняет status.",
    }


def urgency_allowed(urgency: str) -> bool:
    return urgency in {"low", "medium", "high"}