"""Known document comparison registered from the organizer's clarification."""

import re


def valve_temperature_conflict(engine: str, query: str, load_page) -> list[dict]:
    if engine != "ЯМЗ-236М2" or not re.search(r"зазор|клапан\w*\s+механизм|valve\s+clearance", query, re.I):
        return []
    candidates = (
        ("y236-re:p0031", r"холодн\w*\s+двигател\w*"),
        ("y236-rk:p0269", r"не\s+ранее\s+чем\s+через\s+15\s*мин"),
        ("y236-rk:p0276", r"не\s+ранее\s+чем\s+через\s+15\s*мин"),
    )
    sides = []
    operations = {}
    for evidence_id, pattern in candidates:
        page = load_page(evidence_id, full_text=True)
        if not page or page.get("extraction") == "ocr":
            continue
        for paragraph in re.split(r"\n\s*\n|(?<=[.!?])\s+(?=[А-ЯЁ])", page["quote"]):
            if re.search(pattern, paragraph, re.I) and re.search(r"зазор|клапан", paragraph, re.I):
                operation = set()
                if re.search(r"регулир", paragraph, re.I):
                    operation.add("adjust")
                if re.search(r"провер|измер", paragraph, re.I):
                    operation.add("check")
                if not operation:
                    continue
                operations[evidence_id] = operation
                sides.append({**page, "evidence_id": evidence_id, "quote": " ".join(paragraph.split())[:600], "score": 0})
                break
    reference = operations.get(candidates[0][0], set())
    comparable = [hit for hit in sides if reference & operations[hit["evidence_id"]]]
    return comparable if len({hit["doc_id"] for hit in comparable}) >= 2 else []


VALVE_CONFLICT_GUIDANCE = (
    "Руководства указывают разные условия проверки или регулировки зазоров. "
    "Для демонстрационного случая используйте холодный двигатель. "
    "Выдержка 15 минут сама по себе не подтверждает охлаждение. "
    "Порядок для конкретной модификации уточните у специалиста или производителя."
)


def inspection_only(operations: list[str], parts: list[str]) -> bool:
    """A draft can request inspection while a disputed repair remains unresolved."""
    return bool(operations) and not parts and all(
        re.fullmatch(r"(?:проверить|осмотреть)\s+[а-яё\s-]+", operation.strip(), re.I)
        and not re.search(r"отрегулир|регулиров|замен|установ|нагре|остыв|выдерж", operation, re.I)
        for operation in operations
    )
