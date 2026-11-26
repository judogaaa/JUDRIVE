"""Start the isolated E2E backend on a freshly prepared SQLite copy."""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

runpy.run_path(str(Path(__file__).with_name("prepare_e2e_db.py")), run_name="__main__")

import uvicorn  # noqa: E402

uvicorn.run("app.main:app", host="127.0.0.1", port=8091, log_level="warning")
