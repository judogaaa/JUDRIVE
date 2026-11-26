#!/usr/bin/env python3
"""Merge per-locale dict modules into locale_matrix.json."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANG_DIR = ROOT / "frontend" / "src" / "i18n" / "locale_matrix_data"
RU_PATH = ROOT / "frontend" / "src" / "i18n" / "locales" / "ru.json"
OUT = ROOT / "frontend" / "src" / "i18n" / "locale_matrix.json"


def load_pack(code: str) -> dict[str, str]:
    path = LANG_DIR / f"{code}.py"
    spec = importlib.util.spec_from_file_location(code, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return getattr(mod, "PACK")


def main() -> int:
    ru = json.loads(RU_PATH.read_text(encoding="utf-8"))
    codes = ("uz", "kk", "tg", "ky", "hi", "bn")
    matrix: dict[str, dict[str, str]] = {}
    for key in ru:
        matrix[key] = {}
        for code in codes:
            pack = load_pack(code)
            if key not in pack:
                print(f"FAIL {code} missing key {key}", file=sys.stderr)
                return 1
            matrix[key][code] = pack[key]
    OUT.write_text(json.dumps(matrix, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT.name} keys={len(matrix)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())