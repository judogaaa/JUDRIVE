#!/usr/bin/env python3
"""Build complete locale JSON packs from ru.json + per-key matrix."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RU_PATH = ROOT / "frontend" / "src" / "i18n" / "locales" / "ru.json"
OUT_DIR = RU_PATH.parent
MATRIX_PATH = ROOT / "frontend" / "src" / "i18n" / "locale_matrix.json"

LOCALES = ("uz", "kk", "tg", "ky", "hi", "bn")


def main() -> int:
    ru: dict[str, str] = json.loads(RU_PATH.read_text(encoding="utf-8"))
    matrix: dict[str, dict[str, str]] = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    missing = sorted(set(ru) - set(matrix))
    if missing:
        print(f"FAIL: matrix missing {len(missing)} keys, e.g. {missing[:5]}", file=sys.stderr)
        return 1

    for loc in LOCALES:
        pack: dict[str, str] = {}
        for key, ru_val in ru.items():
            row = matrix[key]
            if loc not in row:
                print(f"FAIL: {loc} missing in {key}", file=sys.stderr)
                return 1
            pack[key] = row[loc]
        out = OUT_DIR / f"{loc}.json"
        out.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {out.name} ({len(pack)} keys)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())