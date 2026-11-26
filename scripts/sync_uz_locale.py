#!/usr/bin/env python3
"""Write uz.json from PACK_UZ (hand-maintained Uzbek pack)."""
from __future__ import annotations

import json
from pathlib import Path

from i18n_pack_data import PACK_UZ

OUT = Path(__file__).resolve().parents[1] / "frontend" / "src" / "i18n" / "locales" / "uz.json"


def main() -> None:
    OUT.write_text(json.dumps(PACK_UZ, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT.name} ({len(PACK_UZ)} keys)")


if __name__ == "__main__":
    main()