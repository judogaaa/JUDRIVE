"""Compare the documented valve-clearance conditions instead of matching keywords.

The Russian manuals contain the same procedure with incompatible temperature /
settling conditions.  This module intentionally understands only the small,
explicit set of condition forms used by the original sources.  It never treats
"wait 15 minutes" as proof that the engine has actually cooled down.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

PageLoader = Callable[..., dict | None]

_CANDIDATES = ("y236-re:p0031", "y236-rk:p0269", "y236-rk:p0276")
_VALVE = re.compile(r"зазор|клапан", re.I)
_ADJUST = re.compile(r"регулир|подрегулир", re.I)
_CHECK = re.compile(r"провер|измер|контрол", re.I)
_COLD = re.compile(r"холодн\w*\s+двигател", re.I)
_LT_15 = re.compile(
    r"(?:менее|меньше|раньше|не\s+позднее)\s*,?\s*(?:чем\s+)?через\s+(\d+)\s*"
    r"(?:мин(?:ут)?)\b",
    re.I,
)
_GTE_15 = re.compile(
    r"(?:не\s+ранее|не\s+менее)\s*,?\s*чем\s+через\s+(\d+)\s*(?:мин(?:ут)?)\b"
    r"|через\s+(\d+)\s*(?:мин(?:ут)?)\s+и\s+более",
    re.I,
)
_ALTERNATIVE = re.compile(r"\bили\b|\bлибо\b", re.I)
_ENGINE_238 = re.compile(r"ЯМЗ\s*[-–—]?\s*238", re.I)


@dataclass(frozen=True)
class _Condition:
    evidence_id: str
    doc_id: str
    manual_title: str
    pdf_page: int
    quote: str
    score: float
    extraction: str
    operations: frozenset[str]
    cold: bool
    cold_immediate: bool
    time_relation: str | None
    minutes: int | None
    applicability: str | None


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("ё", "е").replace("Ё", "Е")
    # Join words split by a PDF line break after a hyphen, but keep numeric
    # ranges such as 0,25-0,30 intact.
    text = re.sub(r"(?<=[A-Za-zА-Яа-я])-\s*\n\s*(?=[A-Za-zА-Яа-я])", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _sentences(text: str) -> list[str]:
    # Preserve decimal numbers and section numbers; split at sentence ends.
    return [
        part.strip()
        for part in re.split(r"(?<=[.!?])\s+(?=[А-ЯЁA-Z0-9])", text)
        if part.strip()
    ]


def _time_condition(sentence: str) -> tuple[str | None, int | None]:
    match = _LT_15.search(sentence)
    if match:
        return "lt15", int(match.group(1))
    match = _GTE_15.search(sentence)
    if match:
        number = match.group(1) or match.group(2)
        return "gte15", int(number) if number else None
    return None, None


def _condition(page: dict, evidence_id: str) -> _Condition | None:
    raw = str(page.get("quote") or "")
    normalized = _normalize(raw)
    if not normalized or not _VALVE.search(normalized):
        return None

    chosen = None
    for sentence in _sentences(normalized):
        if not _VALVE.search(sentence):
            continue
        relation, minutes = _time_condition(sentence)
        cold = bool(_COLD.search(sentence))
        if not cold and relation is None:
            continue
        if not (_ADJUST.search(sentence) or _CHECK.search(sentence)):
            continue
        # Prefer a sentence that contains the actual timing condition.
        if relation is not None or cold:
            chosen = (sentence, relation, minutes, cold)
            if relation is not None:
                break
    if chosen is None:
        return None

    sentence, relation, minutes, cold = chosen
    operations = set()
    if _ADJUST.search(sentence):
        operations.add("adjust")
    if _CHECK.search(sentence):
        operations.add("check")
    if not operations:
        return None

    # "cold engine OR wait 15 minutes" permits immediate work on a cold engine.
    # "cold engine AND wait 15 minutes" does not.
    cold_immediate = bool(cold and (relation is None or _ALTERNATIVE.search(sentence)))
    note = None
    if evidence_id == "y236-re:p0031":
        condition_pos = normalized.find(sentence)
        prefix = normalized[: max(0, condition_pos)] if condition_pos >= 0 else normalized
        if _ENGINE_238.search(prefix):
            note = (
                "Страница y236-re:p0031 расположена сразу после упоминания "
                "ЯМЗ-238КМ2; её применимость к ЯМЗ-236М2 требует подтверждения."
            )

    return _Condition(
        evidence_id=evidence_id,
        doc_id=str(page.get("doc_id") or ""),
        manual_title=str(page.get("manual_title") or ""),
        pdf_page=int(page.get("pdf_page") or 0),
        quote=sentence[:600],
        score=0,
        extraction=str(page.get("extraction") or ""),
        operations=frozenset(operations),
        cold=cold,
        cold_immediate=cold_immediate,
        time_relation=relation,
        minutes=minutes,
        applicability=note,
    )


def _incompatible(left: _Condition, right: _Condition) -> bool:
    if not (left.operations & right.operations):
        return False
    # The literal examples: "less than 15 minutes" vs "not earlier than 15".
    if {left.time_relation, right.time_relation} == {"lt15", "gte15"}:
        return True
    # A cold-engine exception versus a mandatory settling interval.
    if left.cold_immediate != right.cold_immediate and (
        left.time_relation == "gte15" or right.time_relation == "gte15"
    ) and (left.cold or right.cold):
        return True
    return False


def valve_temperature_conflict(engine: str, query: str, load_page: PageLoader) -> list[dict]:
    if engine != "ЯМЗ-236М2" or not re.search(
        r"зазор|клапан\w*\s+механизм|valve\s+clearance", query, re.I
    ):
        return []

    conditions: list[_Condition] = []
    for evidence_id in _CANDIDATES:
        page = load_page(evidence_id, full_text=True)
        if not page or page.get("extraction") == "ocr":
            continue
        condition = _condition(page, evidence_id)
        if condition is not None:
            conditions.append(condition)

    if len({item.doc_id for item in conditions}) < 2:
        return []

    conflicting = {
        condition.evidence_id
        for index, left in enumerate(conditions)
        for right in conditions[index + 1 :]
        if _incompatible(left, right)
        for condition in (left, right)
    }
    if not conflicting:
        return []

    # Return every condition that takes part in at least one incompatible pair.
    return [
        {
            "evidence_id": item.evidence_id,
            "doc_id": item.doc_id,
            "manual_title": item.manual_title,
            "pdf_page": item.pdf_page,
            "quote": item.quote,
            "score": item.score,
            "extraction": item.extraction,
            "applicability": item.applicability,
        }
        for item in conditions
        if item.evidence_id in conflicting
    ]


VALVE_CONFLICT_GUIDANCE = (
    "Руководства указывают разные условия проверки или регулировки зазоров: "
    "«на холодном двигателе или менее чем через 15 минут» и «не ранее, чем через "
    "15 минут». Эти условия несовместимы для прогретого двигателя. Выдержка "
    "15 минут сама по себе не подтверждает охлаждение. Не выбирайте один вариант "
    "произвольно; уточните порядок у специалиста или производителя."
)


def inspection_only(operations: list[str], parts: list[str]) -> bool:
    """A draft can request inspection while a disputed repair remains unresolved."""
    return bool(operations) and not parts and all(
        re.fullmatch(r"(?:проверить|осмотреть)\s+[а-яё\s-]+", operation.strip(), re.I)
        and not re.search(
            r"отрегулир|регулиров|замен|установ|нагре|остыв|выдерж",
            operation,
            re.I,
        )
        for operation in operations
    )
