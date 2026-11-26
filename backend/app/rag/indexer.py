from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
from pathlib import Path

from app.rag.catalog import MANUAL_SPECS, ManualSpec
from app.rag.extract import extract_pdf_pages, extraction_profile
from app.rag.normalize import normalize_for_fts

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS index_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    manual_title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_sha256 TEXT NOT NULL,
    page_count INTEGER NOT NULL,
    engine_models TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL UNIQUE,
    doc_id TEXT NOT NULL,
    pdf_page INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    norm_text TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    extraction TEXT NOT NULL,
    UNIQUE(doc_id, pdf_page),
    FOREIGN KEY (doc_id) REFERENCES documents(doc_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    norm_text,
    content='pages',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);
"""


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _corpus_fingerprint(pdf_dir: Path) -> str:
    parts: list[str] = [extraction_profile()]
    for spec in MANUAL_SPECS:
        path = pdf_dir / spec.filename
        if path.is_file():
            parts.append(f"{spec.doc_id}:{_file_sha256(path)}")
        else:
            parts.append(f"{spec.doc_id}:missing")
    joined = "|".join(parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


class ManualIndexer:
    def __init__(self, db_path: Path, pdf_dir: Path) -> None:
        self._db_path = db_path
        self._pdf_dir = pdf_dir
        self._db_path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def missing_files(self) -> list[str]:
        return [spec.filename for spec in MANUAL_SPECS if not (self._pdf_dir / spec.filename).is_file()]

    def is_index_current(self) -> bool:
        if self.missing_files():
            return False
        fingerprint = _corpus_fingerprint(self._pdf_dir)
        if not self._db_path.is_file():
            return False
        with self._connect() as conn:
            conn.executescript(SCHEMA_SQL)
            row = conn.execute(
                "SELECT value FROM index_meta WHERE key = 'corpus_sha256'",
            ).fetchone()
        return bool(row and row["value"] == fingerprint)

    def ensure_index(self, force: bool = False) -> dict:
        missing = self.missing_files()
        if missing:
            return {
                "built": False,
                "reason": "missing_pdf",
                "missing_files": missing,
            }
        if not force and self.is_index_current():
            return {"built": False, "reason": "up_to_date"}

        return self.build_index()

    def build_index(self) -> dict:
        fingerprint = _corpus_fingerprint(self._pdf_dir)
        stats = {"documents": 0, "pages": 0, "ocr_pages": 0, "sparse_pages": 0}

        with self._connect() as conn:
            conn.executescript(SCHEMA_SQL)
            conn.execute("DELETE FROM pages")
            conn.execute("DELETE FROM documents")
            conn.execute("DELETE FROM index_meta")

            for spec in MANUAL_SPECS:
                path = self._pdf_dir / spec.filename
                file_hash = _file_sha256(path)
                pages = extract_pdf_pages(path)
                stats["documents"] += 1

                conn.execute(
                    """
                    INSERT INTO documents (doc_id, manual_title, filename, file_sha256, page_count, engine_models)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        spec.doc_id,
                        spec.manual_title,
                        spec.filename,
                        file_hash,
                        len(pages),
                        json.dumps(spec.engine_models, ensure_ascii=False),
                    ),
                )

                for page in pages:
                    page_id = f"{spec.doc_id}:p{page.pdf_page:04d}"
                    norm_text = normalize_for_fts(page.raw_text)
                    char_count = len(norm_text)
                    if page.extraction == "ocr":
                        stats["ocr_pages"] += 1
                    if char_count < 100:
                        stats["sparse_pages"] += 1

                    conn.execute(
                        """
                        INSERT INTO pages
                            (page_id, doc_id, pdf_page, raw_text, norm_text, char_count, extraction)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            page_id,
                            spec.doc_id,
                            page.pdf_page,
                            page.raw_text,
                            norm_text,
                            char_count,
                            page.extraction,
                        ),
                    )
                    stats["pages"] += 1

            conn.execute(
                "INSERT INTO index_meta(key, value) VALUES ('corpus_sha256', ?)",
                (fingerprint,),
            )
            conn.execute("INSERT INTO pages_fts(pages_fts) VALUES('rebuild')")
            conn.commit()

        logger.info("Manual index built: %s", stats)
        return {"built": True, "corpus_sha256": fingerprint, **stats}

    def get_status(self) -> dict:
        missing = self.missing_files()
        status = {
            "pdf_dir": str(self._pdf_dir),
            "missing_files": missing,
            "index_current": self.is_index_current() if not missing else False,
            "db_path": str(self._db_path),
        }
        if not self._db_path.is_file():
            status["documents"] = 0
            status["pages"] = 0
            return status

        with self._connect() as conn:
            conn.executescript(SCHEMA_SQL)
            status["documents"] = conn.execute("SELECT COUNT(*) AS c FROM documents").fetchone()["c"]
            status["pages"] = conn.execute("SELECT COUNT(*) AS c FROM pages").fetchone()["c"]
        return status