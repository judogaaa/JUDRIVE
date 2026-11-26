"""Построить SQLite FTS5-индекс руководств. Запуск из корня репозитория."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402
from app.rag.service import ManualRagService  # noqa: E402


def main() -> int:
    settings = get_settings()
    service = ManualRagService(settings.db_path, settings.pdf_dir)
    print("PDF_DIR:", settings.pdf_dir)
    print("DB_PATH:", settings.db_path)
    result = service.ensure_index(force="--force" in sys.argv)
    print(result)
    print(service.status())
    return 0 if result.get("built") or result.get("reason") == "up_to_date" else 1


if __name__ == "__main__":
    raise SystemExit(main())