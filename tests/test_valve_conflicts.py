import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.rag.conflicts import VALVE_CONFLICT_GUIDANCE, valve_temperature_conflict  # noqa: E402


def page(doc_id: str, pdf_page: int, quote: str, extraction: str = "poppler-layout") -> dict:
    return {
        "doc_id": doc_id,
        "manual_title": "236-3902150-Б РЭ" if doc_id == "y236-re" else "236.01.01 РК",
        "pdf_page": pdf_page,
        "quote": quote,
        "extraction": extraction,
    }


def test_real_source_conditions_are_compared_not_keyword_matched():
    rows = {
        "y236-re:p0031": page(
            "y236-re",
            31,
            "Для двигателя ЯМЗ-238КМ2 установочный угол 10°. "
            "РЕГУЛИРОВКА КЛАПАННОГО МЕХАНИЗМА. Тепловые зазоры регулировать на холодном "
            "двигателе или менее чем через 15 минут после его остановки.",
        ),
        "y236-rk:p0269": page(
            "y236-rk",
            269,
            "6.4.1 Проверить и подрегулировать тепловые зазоры клапанного меха-\n"
            "низма, но не ранее, чем через 15 мин после остановки двигателя.",
        ),
        "y236-rk:p0276": page(
            "y236-rk",
            276,
            "Примечание - Проверку регулировки зазоров в клапанном механизме производить "
            "на холодном двигателе или не ранее, чем через 15 минут после его остановки.",
        ),
    }
    load = lambda evidence_id, **_: rows.get(evidence_id)
    result = valve_temperature_conflict("ЯМЗ-236М2", "тепловые зазоры клапанного механизма", load)
    assert {hit["evidence_id"] for hit in result} == {"y236-re:p0031", "y236-rk:p0269", "y236-rk:p0276"}
    assert {hit["pdf_page"] for hit in result} == {31, 269, 276}
    assert all(hit["quote"] for hit in result)
    by_id = {hit["evidence_id"]: hit for hit in result}
    assert "механизма" in by_id["y236-rk:p0269"]["quote"]
    assert "ЯМЗ-238" in by_id["y236-re:p0031"]["applicability"]
    assert "сама по себе не подтверждает охлаждение" in VALVE_CONFLICT_GUIDANCE


def test_comma_and_no_comma_variants_are_equivalent():
    base = {
        "y236-re:p0031": page(
            "y236-re",
            31,
            "Тепловые зазоры регулировать на холодном двигателе или менее чем через 15 минут.",
        ),
        "y236-rk:p0269": page(
            "y236-rk",
            269,
            "Тепловые зазоры регулировать не ранее чем через 15 минут.",
        ),
    }
    load = lambda evidence_id, **_: base.get(evidence_id)
    assert valve_temperature_conflict("ЯМЗ-236М2", "зазор клапанов", load)

    base["y236-rk:p0269"] = page(
        "y236-rk",
        269,
        "Тепловые зазоры регулировать не ранее, чем через 15 минут.",
    )
    assert valve_temperature_conflict("ЯМЗ-236М2", "зазор клапанов", load)


def test_missing_source_does_not_create_a_conflict():
    rows = {
        "y236-re:p0031": page(
            "y236-re",
            31,
            "Тепловые зазоры регулировать на холодном двигателе или менее чем через 15 минут.",
        ),
        "y236-rk:p0269": page(
            "y236-rk",
            269,
            "Тепловые зазоры регулировать не ранее, чем через 15 минут.",
        ),
    }
    load = lambda evidence_id, **_: rows.get(evidence_id)
    # Two documents are enough for this conflict, but a single document is not.
    assert valve_temperature_conflict("ЯМЗ-236М2", "зазор клапанов", load)
    one = lambda evidence_id, **_: rows.get(evidence_id) if evidence_id == "y236-rk:p0269" else None
    assert valve_temperature_conflict("ЯМЗ-236М2", "зазор клапанов", one) == []


def test_same_conditions_and_wrong_engine_do_not_conflict():
    rows = {
        "y236-re:p0031": page("y236-re", 31, "Тепловые зазоры регулировать на холодном двигателе."),
        "y236-rk:p0269": page("y236-rk", 269, "Тепловые зазоры регулировать на холодном двигателе."),
        "y236-rk:p0276": page("y236-rk", 276, "Тепловые зазоры регулировать на холодном двигателе."),
    }
    load = lambda evidence_id, **_: rows.get(evidence_id)
    assert valve_temperature_conflict("ЯМЗ-236М2", "зазор клапанов", load) == []
    assert valve_temperature_conflict("ЯМЗ-536", "зазор клапанов", load) == []
    assert valve_temperature_conflict("ЯМЗ-236М2", "генератор", load) == []


def test_unrelated_valve_page_is_not_a_clearance_conflict():
    rows = {
        "y236-re:p0031": page("y236-re", 31, "Тепловые зазоры регулировать на холодном двигателе."),
        "y236-rk:p0269": page("y236-rk", 269, "Редукционный клапан масляного насоса проверять не ранее, чем через 15 минут."),
    }
    load = lambda evidence_id, **_: rows.get(evidence_id)
    assert valve_temperature_conflict("ЯМЗ-236М2", "зазор клапанов", load) == []
