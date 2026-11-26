"""Insert missing action/source/history keys into locale .ts files from fix branch."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ROOT / "frontend" / "src" / "i18n" / "locales"

KEYS = [
    "action.copy",
    "action.copied",
    "action.followUp",
    "action.askFailed",
    "action.askPlan",
    "action.toChat",
    "action.askSource",
    "action.backDiagnosis",
    "history.retry",
    "source.prev",
    "source.next",
    "source.page",
    "source.zoomOut",
    "source.zoomIn",
    "source.fit",
    "source.expand",
    "source.collapse",
]

ANCHOR = "  'verdict.action.otherSession':"


def parse_ts_dict(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in re.finditer(r"^\s*'([^']+)':\s*'((?:\\'|[^'])*)'", text, re.M):
        out[m.group(1)] = m.group(2).replace("\\'", "'")
    return out


def branch_locale(loc: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(ROOT), "show", f"origin/fix/diagnosis-workspace:frontend/src/i18n/locales/{loc}.ts"],
        text=True,
        errors="replace",
    )


def main() -> None:
    ru = (LOCALES / "ru.ts").read_text(encoding="utf-8")
    ru_dict = parse_ts_dict(ru)
    for loc in ("uz", "kk", "tg", "ky", "hi", "bn"):
        path = LOCALES / f"{loc}.ts"
        text = path.read_text(encoding="utf-8")
        if "'action.copy'" in text:
            continue
        branch = parse_ts_dict(branch_locale(loc))
        lines = []
        for key in KEYS:
            val = branch.get(key) or ru_dict.get(key)
            if not val:
                raise SystemExit(f"missing {key} for {loc}")
            val = val.replace("'", "\\'")
            lines.append(f"  '{key}': '{val}',")
        block = "\n".join(lines) + "\n"
        idx = text.find(ANCHOR)
        if idx < 0:
            raise SystemExit(f"anchor not found in {loc}")
        end = text.find("\n", idx)
        text = text[: end + 1] + block + text[end + 1 :]
        path.write_text(text, encoding="utf-8")
        print(f"updated {loc}.ts")

    # sync json from ru.ts / locale ts for pytest parity
    import json

    for loc in ("ru", "uz", "kk", "tg", "ky", "hi", "bn"):
        ts = (LOCALES / f"{loc}.ts").read_text(encoding="utf-8")
        d = parse_ts_dict(ts)
        (LOCALES / f"{loc}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"regenerated {loc}.json ({len(d)} keys)")


if __name__ == "__main__":
    main()