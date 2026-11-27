from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.rag.conflicts import valve_temperature_review
from app.rag.catalog import SPECS_BY_ID, allowed_doc_ids, known_engine_models
from app.rag.indexer import ManualIndexer
from app.rag.search import ManualSearch


AGENT_SEARCH_LIMIT = 8


class ManualRagService:
    def __init__(self, db_path: Path, pdf_dir: Path) -> None:
        self._indexer = ManualIndexer(db_path, pdf_dir)
        self._lock = threading.Lock()

    def status(self) -> dict:
        return self._indexer.get_status()

    def ensure_index(self, force: bool = False) -> dict:
        with self._lock:
            return self._indexer.ensure_index(force=force)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._indexer._db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    def search(self, engine_model: str, query: str, *, limit: int = 5) -> dict:
        query = query.strip()
        if engine_model not in known_engine_models():
            return {
                "status": "unsupported_engine",
                "message": f"Для двигателя «{engine_model}» нет подключённых руководств.",
                "engine_model": engine_model,
                "query": query,
                "results": [],
            }

        if not query:
            return {
                "status": "invalid_query",
                "message": "Укажите текст поискового запроса.",
                "engine_model": engine_model,
                "query": query,
                "results": [],
            }

        missing = self._indexer.missing_files()
        if missing:
            return {
                "status": "index_unavailable",
                "message": "PDF-руководства не подключены. См. docs/SOURCES.md и PDF_DIR.",
                "missing_files": missing,
                "engine_model": engine_model,
                "query": query,
                "results": [],
            }

        build_info = self.ensure_index()
        if build_info.get("reason") == "missing_pdf":
            return {
                "status": "index_unavailable",
                "message": "Не все PDF найдены для индексации.",
                "engine_model": engine_model,
                "query": query,
                "results": [],
                **build_info,
            }

        with self._connection() as conn:
            hits = ManualSearch(conn).search(engine_model, query, limit=limit)

        review = valve_temperature_review(engine_model, query, self.get_evidence)
        if review["status"] == "none" and not hits:
            manuals = [SPECS_BY_ID[d].manual_title for d in allowed_doc_ids(engine_model)]
            return {
                "status": "not_found",
                "message": (
                    f"В руководствах для «{engine_model}» не найдено подтверждённой "
                    f"информации по запросу «{query}». Предлагаем ручной осмотр по "
                    "применимому руководству."
                ),
                "engine_model": engine_model,
                "query": query,
                "manuals": manuals,
                "results": [],
            }

        if review["status"] != "none":
            status = review["status"]
            message = review["message"]
            conflict = review["sources"]
        else:
            status = "ok"
            message = None
            conflict = []

        return {
            "status": status,
            "message": message,
            "conflicting_sources": conflict,
            "engine_model": engine_model,
            "query": query,
            "results": [
                {
                    "evidence_id": hit.evidence_id,
                    "doc_id": hit.doc_id,
                    "manual_title": hit.manual_title,
                    "pdf_page": hit.pdf_page,
                    "quote": hit.quote,
                    "score": hit.score,
                    "extraction": hit.extraction,
                }
                for hit in hits
            ],
        }

    def get_evidence(self, page_id: str, *, full_text: bool = False) -> dict | None:
        if not self._indexer._db_path.is_file():
            return None
        with self._connection() as conn:
            if not self._indexer.has_index(conn):
                return None
            row = ManualSearch(conn).get_page(page_id)
        if not row or not self._indexer.document_matches_index(row["doc_id"], row["file_sha256"]):
            return None
        return {
            "evidence_id": row["page_id"],
            "doc_id": row["doc_id"],
            "manual_title": row["manual_title"],
            "pdf_page": row["pdf_page"],
            "quote": row["raw_text"] if full_text else row["raw_text"][:4000],
            "filename": row["filename"],
            "extraction": row["extraction"],
        }

    def resolve_pdf_path(self, doc_id: str) -> Path | None:
        spec = SPECS_BY_ID.get(doc_id)
        if not spec:
            return None
        path = self._indexer._pdf_dir / spec.filename
        return path if path.is_file() else None