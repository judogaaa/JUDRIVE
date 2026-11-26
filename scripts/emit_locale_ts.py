#!/usr/bin/env python3
"""Emit locales/*.ts from locales/*.json."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend" / "src" / "i18n" / "locales"


def emit(code: str, data: dict[str, str]) -> None:
    lines = [
        "import type { TranslationKey } from '../keys'",
        "",
        f"export const {code}: Record<TranslationKey, string> = {{",
    ]
    for key, value in data.items():
        safe = value.replace("\\", "\\\\").replace("'", "\\'")
        lines.append(f"  '{key}': '{safe}',")
    lines.append("}")
    (ROOT / f"{code}.ts").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    for path in sorted(ROOT.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        emit(path.stem, data)
        print(f"emitted {path.stem}.ts ({len(data)} keys)")


if __name__ == "__main__":
    main()