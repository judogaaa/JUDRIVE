#!/usr/bin/env python3
"""Build uz/kk/tg/ky/hi/bn JSON from ru.json using per-Russian-phrase tables."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RU_PATH = ROOT / "frontend" / "src" / "i18n" / "locales" / "ru.json"
OUT = ROOT / "frontend" / "src" / "i18n" / "locales"

# Import phrase tables (ru phrase -> locale phrase)
from phrase_tables import PHRASE_BN, PHRASE_HI, PHRASE_KK, PHRASE_KY, PHRASE_TG, PHRASE_UZ  # noqa: E402

TABLES = {
    "uz": PHRASE_UZ,
    "kk": PHRASE_KK,
    "tg": PHRASE_TG,
    "ky": PHRASE_KY,
    "hi": PHRASE_HI,
    "bn": PHRASE_BN,
}


def main() -> None:
    ru: dict[str, str] = json.loads(RU_PATH.read_text(encoding="utf-8"))
    for loc, table in TABLES.items():
        pack: dict[str, str] = {}
        for key, phrase in ru.items():
            if phrase not in table:
                raise KeyError(f"Missing phrase for {loc}: {phrase[:60]!r} (key {key})")
            pack[key] = table[phrase]
        (OUT / f"{loc}.json").write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{loc}.json {len(pack)} keys")


if __name__ == "__main__":
    main()