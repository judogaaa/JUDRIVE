#!/usr/bin/env python3
"""Write locale JSON packs from ru.json + per-locale per-key packs."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RU_PATH = ROOT / "frontend" / "src" / "i18n" / "locales" / "ru.json"
OUT_DIR = RU_PATH.parent

# Full per-key translations (175 keys each). Generated content — not user data.
from i18n_pack_data import PACK_KK, PACK_TG, PACK_KY, PACK_HI, PACK_BN, PACK_UZ  # noqa: E402

PACKS = {
    "uz": PACK_UZ,
    "kk": PACK_KK,
    "tg": PACK_TG,
    "ky": PACK_KY,
    "hi": PACK_HI,
    "bn": PACK_BN,
}


def main() -> int:
    ru: dict[str, str] = json.loads(RU_PATH.read_text(encoding="utf-8"))
    for code, pack in PACKS.items():
        if set(pack) != set(ru):
            missing = sorted(set(ru) - set(pack))
            extra = sorted(set(pack) - set(ru))
            print(f"FAIL {code}: missing={len(missing)} extra={len(extra)}", file=sys.stderr)
            if missing:
                print("  missing sample:", missing[:8], file=sys.stderr)
            return 1
        path = OUT_DIR / f"{code}.json"
        path.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())