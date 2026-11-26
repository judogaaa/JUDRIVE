"""Phrase-level locale tables (Russian UI phrase -> localized phrase)."""
from __future__ import annotations

import json
from pathlib import Path

from i18n_pack_data import PACK_UZ

ROOT = Path(__file__).resolve().parents[1]
RU_PATH = ROOT / "frontend" / "src" / "i18n" / "locales" / "ru.json"
MATRIX_PATH = ROOT / "scripts" / "phrases_matrix.json"

RU: dict[str, str] = json.loads(RU_PATH.read_text(encoding="utf-8"))
PHRASE_UZ: dict[str, str] = {RU[k]: PACK_UZ[k] for k in RU}

_matrix: dict[str, dict[str, str]] = {}
if MATRIX_PATH.exists():
    _matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def _phrase_table(loc: str) -> dict[str, str]:
    table: dict[str, str] = {}
    for key, phrase in RU.items():
        if loc == "uz":
            table[phrase] = PACK_UZ[key]
            continue
        row = _matrix.get(phrase, {})
        if loc in row and row[loc].strip():
            table[phrase] = row[loc]
        else:
            table[phrase] = PACK_UZ[key]
    return table


PHRASE_KK = _phrase_table("kk")
PHRASE_TG = _phrase_table("tg")
PHRASE_KY = _phrase_table("ky")
PHRASE_HI = _phrase_table("hi")
PHRASE_BN = _phrase_table("bn")