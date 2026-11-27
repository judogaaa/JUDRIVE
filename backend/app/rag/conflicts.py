"""Compare valve-clearance conditions from the original Russian manuals.

Only the small, explicit condition vocabulary used by the source documents is
considered.  A statement such as "wait 15 minutes" is never treated as proof
that the engine has cooled down; the module compares the actual numerical
intervals and the cold-engine alternative where the wording makes the logical
connection clear.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Literal

PageLoader = Callable[..., dict | None]
Status = Literal["conflict", "potential_conflict", "none"]
ScopeKind = Literal["time_only", "cold_only", "cold_or_time", "cold_and_time", "unknown"]
PairKind = Literal["compatible", "potential", "conflict"]

_CANDIDATES = ("y236-re:p0031", "y236-rk:p0269", "y236-rk:p0276")
_VALVE = re.compile(r"зазор|клапан", re.I)
_ADJUST = re.compile(r"регулир|подрегулир", re.I)
_CHECK = re.compile(r"провер|измер|контрол", re.I)
_COLD = re.compile(r"холодн\w*\s+двигател", re.I)
_OR = re.compile(r"\bили\b|\bлибо\b", re.I)
_AND = re.compile(r"\bи\b", re.I)
_AFTER_STOP = re.compile(r"после\s+(?:его\s+)?остановк", re.I)
_ENGINE_238 = re.compile(r"ЯМЗ\s*[-–—]?\s*238", re.I)

_NUMBER = r"(\d+(?:[.,]\d+)?)"
_UNIT = r"(мин(?:ут[аы]?)?|ч(?:ас(?:а|ов)?)?)"
_QT = r"(?:через\s+)?"
_TIME_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("lt", re.compile(rf"(?:менее|меньше|раньше)\s*,?\s*(?:чем\s+)?{_QT}{_NUMBER}\s*{_UNIT}", re.I)),
    ("lte", re.compile(
        rf"(?:(?:не\s+позднее|не\s+позже)\s*,?\s*(?:чем\s+)?{_QT}{_NUMBER}\s*{_UNIT}"
        rf"|в\s+течение\s+{_NUMBER}\s*{_UNIT})",
        re.I,
    )),
    ("gte", re.compile(
        rf"(?:не\s+ранее|не\s+менее)\s*,?\s*(?:чем\s+)?{_QT}{_NUMBER}\s*{_UNIT}",
        re.I,
    )),
    ("gt", re.compile(
        rf"(?:позже|позднее|более)\s*,?\s*(?:чем\s+)?{_QT}{_NUMBER}\s*{_UNIT}",
        re.I,
    )),
)
_EXACT = re.compile(rf"{_QT}{_NUMBER}\s*{_UNIT}", re.I)


@dataclass(frozen=True)
class _Interval:
    relation: str
    minutes: float
    low: float | None
    low_inclusive: bool
    high: float | None
    high_inclusive: bool
    uncertain: bool
    after_stop: bool

    @property
    def direction(self) -> str:
        if self.low is not None and self.high is not None:
            return "exact"
        if self.low is not None:
            return "lower"
        if self.high is not None:
            return "upper"
        return "none"

    def label(self) -> str:
        value = f"{self.minutes:g}"
        labels = {
            "lt": f"менее {value} мин",
            "lte": f"не позднее {value} мин",
            "gte": f"не ранее {value} мин",
            "gt": f"позже {value} мин",
            "exact": f"через {value} мин",
        }
        return labels.get(self.relation, f"через {value} мин")


@dataclass(frozen=True)
class _Condition:
    evidence_id: str
    doc_id: str
    manual_title: str
    pdf_page: int
    quote: str
    extraction: str
    operations: frozenset[str]
    interval: _Interval | None
    scope: ScopeKind
    applicability: str | None
    condition: str


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("ё", "е").replace("Ё", "Е")
    # Join a word broken across a PDF line after a hyphen.  Numeric ranges
    # such as 0,25-0,30 stay untouched.
    text = re.sub(r"(?<=[A-Za-zА-Яа-я])-\s*\n\s*(?=[A-Za-zА-Яа-я])", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _sentences(text: str) -> list[str]:
    return [
        part.strip()
        for part in re.split(r"(?<=[.!?])\s+(?=[А-ЯЁA-Z0-9])", text)
        if part.strip()
    ]


def _minutes(number: str, unit: str) -> float:
    value = float(number.replace(",", "."))
    return value * 60 if unit.casefold().startswith("ч") else value


def _parse_time(sentence: str) -> tuple[_Interval | None, tuple[int, int] | None]:
    for relation, pattern in _TIME_PATTERNS:
        match = pattern.search(sentence)
        if not match:
            continue
        number = next(group for group in match.groups() if group and any(ch.isdigit() for ch in group))
        unit = next((group for group in match.groups() if group and not any(ch.isdigit() for ch in group)), "мин")
        minutes = _minutes(number, unit)
        after_stop = bool(_AFTER_STOP.search(sentence))
        if relation == "lt":
            interval = _Interval(relation, minutes, None, True, minutes, False, not after_stop, after_stop)
        elif relation == "lte":
            interval = _Interval(relation, minutes, None, True, minutes, True, not after_stop, after_stop)
        elif relation == "gte":
            interval = _Interval(relation, minutes, minutes, True, None, True, not after_stop, after_stop)
        else:
            interval = _Interval(relation, minutes, minutes, False, None, True, not after_stop, after_stop)
        return interval, match.span()

    # A bare "через 15 минут" is deliberately uncertain: the source may mean
    # an exact moment or "after that moment".  It must not create a confirmed
    # conflict without an explicit qualifier.
    match = _EXACT.search(sentence)
    if match:
        number = next(group for group in match.groups() if group and any(ch.isdigit() for ch in group))
        unit = next((group for group in match.groups() if group and not any(ch.isdigit() for ch in group)), "мин")
        minutes = _minutes(number, unit)
        after_stop = bool(_AFTER_STOP.search(sentence))
        return _Interval("exact", minutes, minutes, True, minutes, True, True, after_stop), match.span()
    return None, None


def _scope(sentence: str, cold_match: re.Match[str] | None, time_span: tuple[int, int] | None) -> ScopeKind:
    if cold_match is None:
        return "time_only" if time_span is not None else "unknown"
    if time_span is None:
        return "cold_only"
    if cold_match.end() <= time_span[0]:
        between = sentence[cold_match.end() : time_span[0]]
    else:
        between = sentence[time_span[1] : cold_match.start()]
    has_or = bool(_OR.search(between))
    has_and = bool(_AND.search(between))
    if has_or and not has_and:
        return "cold_or_time"
    if has_and and not has_or:
        return "cold_and_time"
    # An "или" elsewhere in the sentence, or an ambiguous comma, must not be
    # silently interpreted as a conjunction.
    return "unknown"


def _summary(operations: frozenset[str], scope: ScopeKind, interval: _Interval | None) -> str:
    if operations == {"check", "adjust"}:
        operation = "проверка и регулировка"
    elif "adjust" in operations:
        operation = "регулировка"
    else:
        operation = "проверка"
    time_label = interval.label() if interval else "ожидание"
    if scope == "cold_only":
        condition = "холодный двигатель"
    elif scope == "time_only":
        condition = time_label
        if interval and not interval.after_stop:
            condition += " (без явного указания «после остановки»)"
    elif scope == "cold_or_time":
        condition = f"холодный двигатель ИЛИ {time_label}"
    elif scope == "cold_and_time":
        condition = f"холодный двигатель И {time_label}"
    else:
        condition = "связь температуры и времени не определена"
    return f"{operation}: {condition}"


def _condition(page: dict, evidence_id: str) -> _Condition | None:
    raw = str(page.get("quote") or "")
    normalized = _normalize(raw)
    if not normalized or not _VALVE.search(normalized):
        return None

    chosen = None
    for sentence in _sentences(normalized):
        if not _VALVE.search(sentence):
            continue
        interval, time_span = _parse_time(sentence)
        cold = _COLD.search(sentence)
        if cold is None and interval is None:
            continue
        if not (_ADJUST.search(sentence) or _CHECK.search(sentence)):
            continue
        scope = _scope(sentence, cold, time_span)
        chosen = (sentence, interval, scope)
        if interval is not None:
            break
    if chosen is None:
        return None

    sentence, interval, scope = chosen
    operations = set()
    if _ADJUST.search(sentence):
        operations.add("adjust")
    if _CHECK.search(sentence):
        operations.add("check")
    if not operations:
        return None

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
        extraction=str(page.get("extraction") or ""),
        operations=frozenset(operations),
        interval=interval,
        scope=scope,
        applicability=note,
        condition=_summary(frozenset(operations), scope, interval),
    )


def _overlap(left: _Interval, right: _Interval) -> bool:
    if left.high is not None and right.low is not None:
        if left.high < right.low:
            return False
        if left.high == right.low and not (left.high_inclusive and right.low_inclusive):
            return False
    if right.high is not None and left.low is not None:
        if right.high < left.low:
            return False
        if right.high == left.low and not (right.high_inclusive and left.low_inclusive):
            return False
    return True


def _interval_kind(left: _Interval, right: _Interval) -> Literal["disjoint", "same", "compatible", "overlap", "uncertain"]:
    if left.uncertain or right.uncertain:
        return "uncertain"
    if not _overlap(left, right):
        return "disjoint"
    if (
        left.low == right.low
        and left.high == right.high
        and left.low_inclusive == right.low_inclusive
        and left.high_inclusive == right.high_inclusive
    ):
        return "same"
    if left.direction == right.direction and left.direction in {"lower", "upper"}:
        return "compatible"
    return "overlap"


def _pair_kind(left: _Condition, right: _Condition) -> PairKind:
    if not (left.operations & right.operations):
        return "compatible"
    if left.scope == "unknown" or right.scope == "unknown":
        return "potential"
    if left.scope == "cold_only" and right.scope == "cold_or_time":
        return "compatible"
    if right.scope == "cold_only" and left.scope == "cold_or_time":
        return "compatible"
    if left.scope == "cold_only" and right.scope == "cold_only":
        return "compatible"
    if left.scope != right.scope:
        return "potential"
    if left.interval is None or right.interval is None:
        return "potential"
    relation = _interval_kind(left.interval, right.interval)
    if relation == "disjoint":
        # A cold-engine alternative makes even disjoint warm-engine intervals
        # an unresolved question rather than a proven universal contradiction.
        return "potential" if left.scope == "cold_or_time" else "conflict"
    if relation in {"same", "compatible"}:
        return "compatible"
    return "potential"


def _source(item: _Condition) -> dict:
    return {
        "evidence_id": item.evidence_id,
        "doc_id": item.doc_id,
        "manual_title": item.manual_title,
        "pdf_page": item.pdf_page,
        "quote": item.quote,
        "score": 0,
        "extraction": item.extraction,
        "applicability": item.applicability,
        "condition": item.condition,
    }


def _notes(sources: list[dict]) -> list[str]:
    notes = []
    for source in sources:
        note = str(source.get("applicability") or "").strip()
        if note and note not in notes:
            notes.append(note)
    return notes


def _conditions_text(sources: list[dict]) -> str:
    return "; ".join(f"{source['evidence_id']}: {source.get('condition', 'условие не определено')}" for source in sources)


def valve_temperature_review(engine: str, query: str, load_page: PageLoader) -> dict:
    if engine != "ЯМЗ-236М2" or not re.search(
        r"зазор|клапан\w*\s+механизм|valve\s+clearance", query, re.I
    ):
        return {"status": "none", "sources": [], "message": None}

    conditions: list[_Condition] = []
    for evidence_id in _CANDIDATES:
        page = load_page(evidence_id, full_text=True)
        if not page or page.get("extraction") == "ocr":
            continue
        condition = _condition(page, evidence_id)
        if condition is not None:
            conditions.append(condition)

    if len(conditions) < 2:
        return {"status": "none", "sources": [], "message": None}

    pairs: list[tuple[_Condition, _Condition, PairKind]] = []
    for index, left in enumerate(conditions):
        for right in conditions[index + 1 :]:
            kind = _pair_kind(left, right)
            if kind != "compatible":
                pairs.append((left, right, kind))

    if not pairs:
        return {"status": "none", "sources": [], "message": None}

    participating = {item.evidence_id for left, right, _ in pairs for item in (left, right)}
    sources = [_source(item) for item in conditions if item.evidence_id in participating]
    confirmed = any(
        kind == "conflict"
        and left.doc_id != right.doc_id
        and left.applicability is None
        and right.applicability is None
        for left, right, kind in pairs
    )

    reasons: list[str] = []
    for left, right, kind in pairs:
        same_doc = left.doc_id == right.doc_id
        uncertain_applicability = bool(left.applicability or right.applicability)
        if kind == "conflict" and (same_doc or uncertain_applicability):
            if same_doc:
                reasons.append(
                    f"источники {left.evidence_id} и {right.evidence_id} относятся к одному документу, "
                    "а не к двум независимым руководствам"
                )
        elif kind == "potential":
            if left.scope != right.scope:
                reasons.append("формулировки по-разному связывают холодный двигатель и ожидание")
            elif left.interval is not None and right.interval is not None:
                interval_kind = _interval_kind(left.interval, right.interval)
                if interval_kind == "uncertain":
                    reasons.append("в формулировке не хватает однозначной связи условия и времени")
                elif interval_kind == "overlap":
                    reasons.append("временные интервалы пересекаются или совпадают на границе")
                elif interval_kind == "disjoint":
                    reasons.append("разные допустимые интервалы, но остаётся температурная оговорка")
            if same_doc:
                reasons.append(
                    f"источники {left.evidence_id} и {right.evidence_id} относятся к одному документу"
                )

    reasons = list(dict.fromkeys(reasons))
    notes = _notes(sources)
    if confirmed:
        status: Status = "conflict"
        message = (
            "Подтверждённое противоречие: для одной технической операции указаны "
            "несовместимые условия. " + _conditions_text(sources) + ". "
            "Выдержка 15 минут сама по себе не подтверждает охлаждение. "
            "Не выбирайте один вариант произвольно; уточните порядок у специалиста "
            "или производителя."
        )
    else:
        status = "potential_conflict"
        message = (
            "Потенциальное расхождение: источники различаются, но подтверждённый "
            "конфликт не установлен. " + _conditions_text(sources) + ". "
            + ("Причины: " + "; ".join(reasons) + ". " if reasons else "")
            + "Выдержка 15 минут сама по себе не подтверждает охлаждение. "
            "Не выбирайте один вариант произвольно; уточните порядок у специалиста "
            "или производителя."
        )
    if notes:
        message += " " + " ".join(notes)

    return {"status": status, "sources": sources, "message": message}


def valve_temperature_conflict(engine: str, query: str, load_page: PageLoader) -> list[dict]:
    """Backward-compatible confirmed-conflict view used by older callers."""
    review = valve_temperature_review(engine, query, load_page)
    return review["sources"] if review["status"] == "conflict" else []


VALVE_CONFLICT_GUIDANCE = (
    "Подтверждённое противоречие: условия проверки или регулировки зазоров "
    "несовместимы. Выдержка 15 минут сама по себе не подтверждает охлаждение. "
    "Не выбирайте один вариант произвольно; уточните порядок у специалиста или "
    "производителя."
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
