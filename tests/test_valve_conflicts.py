import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.rag.conflicts import (  # noqa: E402
    VALVE_CONFLICT_GUIDANCE,
    valve_temperature_conflict,
    valve_temperature_review,
)


def page(doc_id: str, pdf_page: int, quote: str, extraction: str = "poppler-layout") -> dict:
    return {
        "doc_id": doc_id,
        "manual_title": "236-3902150-Б РЭ" if doc_id == "y236-re" else "236.01.01 РК",
        "pdf_page": pdf_page,
        "quote": quote,
        "extraction": extraction,
    }


def review(rows: dict, query: str = "зазор клапанов", engine: str = "ЯМЗ-236М2") -> dict:
    load = lambda evidence_id, **_: rows.get(evidence_id)
    return valve_temperature_review(engine, query, load)


def test_real_sources_are_a_potential_conflict_not_a_proven_one():
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
    result = review(rows)
    assert result["status"] == "potential_conflict"
    assert {hit["evidence_id"] for hit in result["sources"]} == {
        "y236-re:p0031",
        "y236-rk:p0269",
        "y236-rk:p0276",
    }
    assert {hit["pdf_page"] for hit in result["sources"]} == {31, 269, 276}
    by_id = {hit["evidence_id"]: hit for hit in result["sources"]}
    assert "механизма" in by_id["y236-rk:p0269"]["quote"]
    assert "ЯМЗ-238" in by_id["y236-re:p0031"]["applicability"]
    assert "менее 15" in by_id["y236-re:p0031"]["condition"]
    assert "не ранее 15" in by_id["y236-rk:p0269"]["condition"]
    assert "к одному документу" in result["message"]
    assert "Потенциальное расхождение" in result["message"]
    assert "сама по себе не подтверждает охлаждение" in result["message"]


def test_confirmed_conflict_requires_independent_applicable_documents():
    rows = {
        "y236-re:p0031": page("y236-re", 31, "Тепловые зазоры регулировать менее чем через 15 минут после остановки."),
        "y236-rk:p0269": page("y236-rk", 269, "Тепловые зазоры регулировать не ранее, чем через 15 минут после остановки."),
    }
    result = review(rows)
    assert result["status"] == "conflict"
    assert {hit["doc_id"] for hit in result["sources"]} == {"y236-re", "y236-rk"}
    assert "Подтверждённое противоречие" in result["message"]

    # The same two conditions become unresolved when page 31 follows the
    # ЯМЗ-238КМ2 context.
    rows["y236-re:p0031"] = page(
        "y236-re",
        31,
        "Для двигателя ЯМЗ-238КМ2. Тепловые зазоры регулировать менее чем через 15 минут.",
    )
    assert review(rows)["status"] == "potential_conflict"


@pytest.mark.parametrize(
    ("left", "right", "expected"),
    [
        ("менее чем через 15 минут", "не ранее, чем через 15 минут", "conflict"),
        ("менее чем через 20 минут", "не ранее, чем через 15 минут", "potential_conflict"),
        ("не позднее чем через 15 минут", "не ранее, чем через 15 минут", "potential_conflict"),
        ("менее чем через 10 минут", "не ранее, чем через 15 минут", "conflict"),
        ("не ранее, чем через 15 минут", "не ранее, чем через 20 минут", "none"),
        ("через 15 минут", "не ранее, чем через 15 минут", "potential_conflict"),
    ],
)
def test_numeric_and_boundary_interval_comparison(left, right, expected):
    rows = {
        "y236-re:p0031": page("y236-re", 31, f"Тепловые зазоры регулировать {left} после остановки."),
        "y236-rk:p0269": page("y236-rk", 269, f"Тепловые зазоры регулировать {right} после остановки."),
    }
    assert review(rows)["status"] == expected


def test_commas_line_breaks_and_minute_forms_are_equivalent():
    rows = {
        "y236-re:p0031": page(
            "y236-re",
            31,
            "Тепловые зазоры регулировать менее, чем через 15 минут\nпосле остановки.",
        ),
        "y236-rk:p0269": page(
            "y236-rk",
            269,
            "Тепловые зазоры регулировать не ранее, чем через 15 минут после остановки.",
        ),
    }
    assert review(rows)["status"] == "conflict"

    rows["y236-rk:p0269"] = page(
        "y236-rk",
        269,
        "Тепловые зазоры регулировать не ранее чем через 15 мин после остановки.",
    )
    assert review(rows)["status"] == "conflict"


def test_cold_engine_and_time_connectors_are_scoped_not_guessed():
    time_only = page("y236-rk", 269, "Тепловые зазоры регулировать не ранее, чем через 15 минут после остановки.")
    cold_or = page(
        "y236-re",
        31,
        "Тепловые зазоры регулировать на холодном двигателе или менее чем через 15 минут после остановки.",
    )
    cold_and = page(
        "y236-re",
        31,
        "Тепловые зазоры регулировать на холодном двигателе и менее чем через 15 минут после остановки.",
    )
    cold_only = page("y236-re", 31, "Тепловые зазоры регулировать на холодном двигателе.")

    assert review({"y236-re:p0031": cold_or, "y236-rk:p0269": time_only})["status"] == "potential_conflict"
    assert review({"y236-re:p0031": cold_and, "y236-rk:p0269": time_only})["status"] == "potential_conflict"
    assert review({"y236-re:p0031": cold_only, "y236-rk:p0269": cold_only})["status"] == "none"

    # "или" between actions must not be read as "cold OR time".
    ambiguous = page(
        "y236-re",
        31,
        "Регулировать или заменить клапанный механизм на холодном двигателе через 15 минут.",
    )
    assert review({"y236-re:p0031": ambiguous, "y236-rk:p0269": time_only})["status"] == "potential_conflict"


def test_same_conditions_and_different_operations_do_not_conflict():
    rows = {
        "y236-re:p0031": page("y236-re", 31, "Тепловые зазоры регулировать не ранее, чем через 15 минут после остановки."),
        "y236-rk:p0269": page("y236-rk", 269, "Тепловые зазоры регулировать не ранее, чем через 20 минут после остановки."),
    }
    assert review(rows)["status"] == "none"

    rows["y236-rk:p0269"] = page("y236-rk", 269, "Тепловые зазоры проверять не ранее, чем через 15 минут после остановки.")
    # p31 is adjustment-only, p269 is check-only; no shared operation.
    rows["y236-re:p0031"] = page("y236-re", 31, "Тепловые зазоры регулировать менее чем через 15 минут после остановки.")
    assert review(rows)["status"] == "none"


def test_wrong_engine_unrelated_valve_and_insufficient_sources():
    rows = {
        "y236-re:p0031": page("y236-re", 31, "Тепловые зазоры регулировать менее чем через 15 минут."),
        "y236-rk:p0269": page("y236-rk", 269, "Тепловые зазоры регулировать не ранее, чем через 15 минут."),
    }
    assert review(rows, engine="ЯМЗ-536")["status"] == "none"
    assert review(rows, query="генератор")["status"] == "none"

    one = {"y236-rk:p0269": rows["y236-rk:p0269"]}
    assert review(one)["status"] == "none"

    unrelated = {
        "y236-re:p0031": page("y236-re", 31, "Тепловые зазоры регулировать на холодном двигателе."),
        "y236-rk:p0269": page("y236-rk", 269, "Редукционный клапан масляного насоса проверять не ранее, чем через 15 минут."),
    }
    assert review(unrelated)["status"] == "none"


def test_old_confirmed_wrapper_does_not_promote_potential_results():
    rows = {
        "y236-re:p0031": page(
            "y236-re",
            31,
            "Тепловые зазоры регулировать на холодном двигателе или менее чем через 15 минут.",
        ),
        "y236-rk:p0269": page("y236-rk", 269, "Тепловые зазоры регулировать не ранее, чем через 15 минут."),
    }
    load = lambda evidence_id, **_: rows.get(evidence_id)
    assert valve_temperature_conflict("ЯМЗ-236М2", "зазор клапанов", load) == []
    assert "сама по себе не подтверждает охлаждение" in VALVE_CONFLICT_GUIDANCE
