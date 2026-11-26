import json
from pathlib import Path

ru = json.loads(Path("frontend/src/i18n/locales/ru.json").read_text(encoding="utf-8"))
for i, p in enumerate(sorted(set(ru.values()), key=len)):
    print(f"{i+1}: {p[:80]!r}")
print("count", len(set(ru.values())))