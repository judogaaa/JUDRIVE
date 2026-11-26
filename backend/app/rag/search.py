from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass

from app.rag.catalog import SPECS_BY_ID, allowed_doc_ids
from app.rag.normalize import fts_query_from_user, normalize_for_fts


def _significant_terms(query: str) -> list[str]:
    return [token for token in normalize_for_fts(query).split() if len(token) >= 4]


def _overlap_score(norm_text: str, terms: list[str]) -> tuple[int, float]:
    if not terms:
        return 0, 0.0
    matches = sum(1 for term in terms if term in norm_text)
    return matches, matches / len(terms)


def _hit_is_relevant(norm_text: str, terms: list[str]) -> bool:
    if not terms:
        return False
    matches, ratio = _overlap_score(norm_text, terms)
    if len(terms) == 1:
        return terms[0] in norm_text
    if len(terms) == 2:
        return matches >= 2
    required = max(2, -(-len(terms) * 3 // 5))  # ceil(len*0.6)
    rare_terms = [t for t in terms if len(t) >= 8]
    if len(terms) >= 4 and rare_terms and not any(term in norm_text for term in rare_terms):
        return False
    return matches >= required and ratio >= 0.6


@dataclass(slots=True)
class SearchHit:
    evidence_id: str
    doc_id: str
    manual_title: str
    pdf_page: int
    quote: str
    score: float
    extraction: str


def _snippet(raw_text: str, query: str, radius: int = 420) -> str:
    lowered_text = raw_text.lower().replace("ё", "е")
    normalized_query = normalize_for_fts(query)
    terms = [t for t in normalized_query.split() if len(t) >= 3]
    if not terms:
        compact = re.sub(r"\s+", " ", raw_text).strip()
        return compact[: radius * 2] + ("…" if len(compact) > radius * 2 else "")

    best_pos = -1
    for term in terms:
        pos = lowered_text.find(term)
        if pos != -1 and (best_pos == -1 or pos < best_pos):
            best_pos = pos

    if best_pos == -1:
        compact = re.sub(r"\s+", " ", raw_text).strip()
        return compact[: radius * 2] + ("…" if len(compact) > radius * 2 else "")

    start = max(0, best_pos - radius // 2)
    end = min(len(raw_text), best_pos + radius)
    # Preserve columns/rows when a table is present; do not collapse its values.
    start = raw_text.rfind("\n", 0, start) + 1 if start else 0
    next_line = raw_text.find("\n", end)
    if next_line != -1:
        end = next_line
    snippet = raw_text[start:end].strip()
    if start > 0:
        snippet = "…" + snippet
    if end < len(raw_text):
        snippet = snippet + "…"
    return snippet


class ManualSearch:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def search(self, engine_model: str, query: str, *, limit: int = 5) -> list[SearchHit]:
        doc_ids = allowed_doc_ids(engine_model)
        if not doc_ids:
            return []

        terms = _significant_terms(query)
        fts_query = fts_query_from_user(query)
        if not fts_query:
            return []

        placeholders = ",".join("?" for _ in doc_ids)
        fetch_limit = max(limit * 4, 16)
        sql = f"""
            SELECT
                p.page_id,
                p.doc_id,
                p.pdf_page,
                p.raw_text,
                p.norm_text,
                p.extraction,
                d.manual_title,
                bm25(pages_fts) AS rank
            FROM pages_fts
            JOIN pages p ON pages_fts.rowid = p.rowid
            JOIN documents d ON d.doc_id = p.doc_id
            WHERE pages_fts MATCH ?
              AND p.doc_id IN ({placeholders})
            ORDER BY rank
            LIMIT ?
        """
        params: list[object] = [fts_query, *doc_ids, fetch_limit]
        rows = self._conn.execute(sql, params).fetchall()

        ranked: list[tuple[float, sqlite3.Row]] = []
        for row in rows:
            if not _hit_is_relevant(row["norm_text"], terms):
                continue
            matches, ratio = _overlap_score(row["norm_text"], terms)
            composite = float(row["rank"]) - (matches * 4.0) - (ratio * 2.0)
            ranked.append((composite, row))

        ranked.sort(key=lambda item: item[0])

        hits: list[SearchHit] = []
        for _, row in ranked[:limit]:
            spec = SPECS_BY_ID[row["doc_id"]]
            hits.append(
                SearchHit(
                    evidence_id=row["page_id"],
                    doc_id=row["doc_id"],
                    manual_title=spec.manual_title,
                    pdf_page=row["pdf_page"],
                    quote=_snippet(row["raw_text"], query),
                    score=float(row["rank"]),
                    extraction=row["extraction"],
                )
            )
        return hits

    def get_page(self, page_id: str) -> sqlite3.Row | None:
        return self._conn.execute(
            """
            SELECT p.page_id, p.doc_id, p.pdf_page, p.raw_text, p.extraction, d.manual_title, d.filename
            FROM pages p
            JOIN documents d ON d.doc_id = p.doc_id
            WHERE p.page_id = ?
            """,
            (page_id,),
        ).fetchone()