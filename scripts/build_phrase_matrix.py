#!/usr/bin/env python3
"""Build scripts/phrases_matrix.json via Google/MyMemory (incremental cache file)."""
from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from deep_translator import GoogleTranslator, MyMemoryTranslator

ROOT = Path(__file__).resolve().parents[1]
RU_PATH = ROOT / "frontend" / "src" / "i18n" / "locales" / "ru.json"
OUT = ROOT / "scripts" / "phrases_matrix.json"

# uz comes from PACK_UZ in phrase_tables — skip here to save quota.
TARGETS = {
    "kk": ("kk", "kk-KZ"),
    "tg": ("tg", "tg-TJ"),
    "ky": ("ky", "ky-KG"),
    "hi": ("hi", "hi-IN"),
    "bn": ("bn", "bn-IN"),
}


def translate_one(phrase: str, google_code: str, memory_code: str) -> str:
    for _ in range(2):
        try:
            return GoogleTranslator(source="ru", target=google_code).translate(phrase)
        except Exception:
            pass
    for _ in range(2):
        try:
            return MyMemoryTranslator(source="ru-RU", target=memory_code).translate(phrase)
        except Exception:
            time.sleep(0.2)
    return phrase


def main() -> None:
    ru = json.loads(RU_PATH.read_text(encoding="utf-8"))
    phrases = sorted(set(ru.values()), key=len)
    matrix: dict[str, dict[str, str]] = {}
    if OUT.exists():
        matrix = json.loads(OUT.read_text(encoding="utf-8"))

    jobs: list[tuple[str, str, str, str]] = []
    for phrase in phrases:
        row = matrix.setdefault(phrase, {})
        for loc, (gcode, mcode) in TARGETS.items():
            if loc in row and row[loc].strip():
                continue
            jobs.append((phrase, loc, gcode, mcode))

    if not jobs:
        print(f"matrix complete phrases={len(matrix)}")
        return

    done = 0
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {
            pool.submit(translate_one, phrase, gcode, mcode): (phrase, loc)
            for phrase, loc, gcode, mcode in jobs
        }
        for fut in as_completed(futures):
            phrase, loc = futures[fut]
            try:
                matrix[phrase][loc] = fut.result()
            except Exception:
                matrix[phrase][loc] = phrase
            done += 1
            if done % 25 == 0:
                OUT.write_text(json.dumps(matrix, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"progress {done}/{len(jobs)}")

    OUT.write_text(json.dumps(matrix, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"matrix phrases={len(matrix)} jobs={len(jobs)}")


if __name__ == "__main__":
    main()