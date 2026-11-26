"""Create an isolated application SQLite database for ticket E2E.

The manual index lives in the same database file, so the working database is
copied with the SQLite backup API and only application rows are cleared. The
working database is never modified or deleted.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "local-data" / "judrive.sqlite"
TARGET_DIR = ROOT / "local-data" / "e2e"
TARGET = TARGET_DIR / "judrive-e2e.sqlite"
APP_TABLES = (
    "chat_messages",
    "chat_conversations",
    "ticket_drafts",
    "ticket_submissions",
    "groq_usage",
    "groq_usage_steps",
    "chief_quarantine_events",
)


def main() -> None:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal", "-shm"):
        Path(str(TARGET) + suffix).unlink(missing_ok=True)

    if not SOURCE.exists():
        print(f"source database missing: {SOURCE}")
        return

    source = sqlite3.connect(f"file:{SOURCE.as_posix()}?mode=ro", uri=True)
    target = sqlite3.connect(TARGET)
    try:
        source.backup(target)
        existing = {
            row[0]
            for row in target.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
        for table in APP_TABLES:
            if table in existing:
                target.execute(f"DELETE FROM {table}")
        target.commit()
        target.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        target.close()
        source.close()
    print(f"prepared isolated database: {TARGET}")


if __name__ == "__main__":
    main()
