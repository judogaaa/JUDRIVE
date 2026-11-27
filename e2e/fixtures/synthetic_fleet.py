"""Test-only fleet generator. Does not read organizer data or a production database."""
from datetime import UTC, datetime, timedelta
import json
from pathlib import Path
import sys


def generate(target: Path) -> None:
    fleet = []

    def vehicle(ident, engine, make, garage, session_ids, outcomes):
        sessions = []
        for index, number in enumerate(session_ids):
            status, fault, quality, score, confidence = outcomes.get(number, ("normal", None, "good", .12, .90))
            sessions.append({
                "vehicle_id": ident, "session_id": f"S-{number:04}",
                "checked_at": (datetime(2025, 1, 1, tzinfo=UTC) + timedelta(days=index)).isoformat(),
                "status": status, "anomaly_type": fault, "anomaly_title": FAULTS.get(fault),
                "anomaly_score": score, "confidence": confidence, "signal_quality": quality,
                "description": ("Синтетическая запись: перегрузка микрофона." if quality == "bad"
                                else "Синтетическое наблюдение для проверки контракта."),
                "model_version": "test-fixture-1",
            })
        fuel = "diesel" if engine.startswith("ЯМЗ") else "gasoline"
        fleet.append(dict(vehicle_id=ident, garage_no=garage, make=make, model="Учебный",
                          vehicle_type="truck", engine_model=engine, fuel=fuel, sessions=sessions))

    normal = ("normal", None, "good", .12, .90)
    bad = ("check_failed", None, "bad", None, None)
    valve = ("anomaly", "F01", "good", .78, .85)
    vehicle("P456AT178", "ЗМЗ-5234.10", "МАЗ", "T001", range(1, 4), {3: bad})
    vehicle("M333YK47", "ЯМЗ-236М2", "МАЗ", "T002", range(4, 7), {6: normal})
    vehicle("B418HK98", "ЯМЗ-236М2", "МАЗ", "T003", range(7, 10), {8: valve, 9: valve})
    vehicle("E549YT198", "ЯМЗ-236М2", "МАЗ", "T004", range(10, 13),
            {11: ("anomaly", "F02", "good", .75, .85)})
    vehicle("P854BT78", "ЯМЗ-236М2", "МАЗ", "T005", range(19, 22),
            {21: ("anomaly", "F14", "good", .80, .90)})
    vehicle("T792HO98", "ЯМЗ-536", "Учебный", "T006", range(41, 44),
            {43: ("anomaly", "F02", "good", .60, .70)})
    vehicle("C991PH47", "ЗМЗ-40905.10", "УАЗ", "T007", range(146, 149),
            {148: ("anomaly", "F12", "warning", .56, .56)})

    for index in range(43):
        start = 200 + 5 * index
        numbers = range(start, start + (5 if index < 2 else 4))
        latest = valve if index < 18 else bad if index < 20 else normal
        vehicle(f"T{index + 101:03}XX00", "ЯМЗ-236М2", "Учебный", f"T{index + 8:03}", numbers,
                {numbers[-1]: latest})
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"vehicles": fleet}, ensure_ascii=False), encoding="utf-8")


FAULTS = {"F01": "Клапанный механизм", "F02": "Система смазки",
          "F12": "Зажигание", "F14": "Цепь ГРМ"}


if __name__ == "__main__":
    generate(Path(sys.argv[1]))
