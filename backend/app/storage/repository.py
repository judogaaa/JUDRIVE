from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator

from app.storage.schema import APP_SCHEMA_SQL


def _now() -> str:
    return datetime.now(UTC).isoformat()


class AppRepository:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        """Commit/rollback and always close; sqlite's own context manager does not close."""
        conn = self._connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._connection() as conn:
            conn.executescript(APP_SCHEMA_SQL)

    def create_conversation(self, vehicle_id: str, session_id: str, engine_model: str, context_hash: str) -> str:
        conversation_id = str(uuid.uuid4())
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO chat_conversations (id, vehicle_id, session_id, engine_model, context_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (conversation_id, vehicle_id, session_id, engine_model, context_hash, _now()),
            )
            conn.commit()
        return conversation_id

    def get_conversation(self, conversation_id: str) -> sqlite3.Row | None:
        with self._connection() as conn:
            return conn.execute(
                "SELECT * FROM chat_conversations WHERE id = ?",
                (conversation_id,),
            ).fetchone()

    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        *,
        tool_trace: list | None = None,
        sources: list | None = None,
        draft_id: str | None = None,
    ) -> str:
        message_id = str(uuid.uuid4())
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO chat_messages (id, conversation_id, role, content, tool_trace, sources, draft_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message_id,
                    conversation_id,
                    role,
                    content,
                    json.dumps(tool_trace or [], ensure_ascii=False),
                    json.dumps(sources or [], ensure_ascii=False),
                    draft_id,
                    _now(),
                ),
            )
            conn.commit()
        return message_id

    def list_messages(self, conversation_id: str) -> list[sqlite3.Row]:
        with self._connection() as conn:
            return conn.execute(
                "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at",
                (conversation_id,),
            ).fetchall()

    def save_draft(
        self,
        conversation_id: str,
        vehicle_id: str,
        session_id: str,
        diagnosis_hash: str,
        payload: dict,
    ) -> dict:
        draft_id = str(uuid.uuid4())
        nonce = str(uuid.uuid4())
        now = _now()
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO ticket_drafts
                (draft_id, conversation_id, vehicle_id, session_id, version, status, confirm_nonce,
                 diagnosis_hash, payload_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, 'draft', ?, ?, ?, ?, ?)
                """,
                (
                    draft_id,
                    conversation_id,
                    vehicle_id,
                    session_id,
                    nonce,
                    diagnosis_hash,
                    json.dumps(payload, ensure_ascii=False),
                    now,
                    now,
                ),
            )
            conn.commit()
        return {"draft_id": draft_id, "confirm_nonce": nonce, "version": 1, "status": "draft", "payload": payload}

    def get_draft(self, draft_id: str) -> sqlite3.Row | None:
        with self._connection() as conn:
            return conn.execute("SELECT * FROM ticket_drafts WHERE draft_id = ?", (draft_id,)).fetchone()

    def invalidate_drafts_for_context(self, vehicle_id: str, session_id: str) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                UPDATE ticket_drafts
                SET status = 'stale', updated_at = ?
                WHERE vehicle_id = ? AND session_id = ? AND status = 'draft'
                """,
                (_now(), vehicle_id, session_id),
            )
            conn.commit()

    def mark_draft_submitted(self, draft_id: str) -> None:
        with self._connection() as conn:
            conn.execute(
                "UPDATE ticket_drafts SET status = 'submitted', updated_at = ? WHERE draft_id = ?",
                (_now(), draft_id),
            )
            conn.commit()

    def claim_draft_sending(self, draft_id: str, confirm_nonce: str) -> bool:
        """Атомарно переводит черновик draft → sending до вызова ТОиР."""
        with self._connection() as conn:
            cur = conn.execute(
                """
                UPDATE ticket_drafts
                SET status = 'sending', updated_at = ?
                WHERE draft_id = ? AND confirm_nonce = ? AND status = 'draft'
                """,
                (_now(), draft_id, confirm_nonce),
            )
            conn.commit()
            return cur.rowcount == 1

    def set_draft_status(self, draft_id: str, status: str) -> None:
        with self._connection() as conn:
            conn.execute(
                "UPDATE ticket_drafts SET status = ?, updated_at = ? WHERE draft_id = ?",
                (status, _now(), draft_id),
            )
            conn.commit()

    def claim_pair_sending(
        self,
        draft_id: str,
        vehicle_id: str,
        session_id: str,
        payload_snapshot: dict,
    ) -> str | None:
        """Одна активная отправка на пару ТС/сессия до ответа ТОиР."""
        local_id = str(uuid.uuid4())
        try:
            with self._connection() as conn:
                conn.execute(
                    """
                    INSERT INTO ticket_submissions
                    (local_id, draft_id, vehicle_id, session_id, ticket_id, submit_status,
                     payload_snapshot, error_detail, created_at)
                    VALUES (?, ?, ?, ?, NULL, 'sending', ?, NULL, ?)
                    """,
                    (
                        local_id,
                        draft_id,
                        vehicle_id,
                        session_id,
                        json.dumps(payload_snapshot, ensure_ascii=False),
                        _now(),
                    ),
                )
                conn.commit()
        except sqlite3.IntegrityError:
            return None
        return local_id

    def finish_submission(
        self,
        local_id: str,
        *,
        submit_status: str,
        ticket_id: str | None = None,
        error_detail: str | None = None,
    ) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                UPDATE ticket_submissions
                SET submit_status = ?, ticket_id = ?, error_detail = ?
                WHERE local_id = ?
                """,
                (submit_status, ticket_id, error_detail, local_id),
            )
            conn.commit()

    def has_blocking_submission(self, vehicle_id: str, session_id: str) -> sqlite3.Row | None:
        with self._connection() as conn:
            return conn.execute(
                """
                SELECT * FROM ticket_submissions
                WHERE vehicle_id = ? AND session_id = ?
                  AND submit_status IN ('created', 'unknown', 'sending')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (vehicle_id, session_id),
            ).fetchone()

    def has_submitted_ticket(self, vehicle_id: str, session_id: str) -> bool:
        with self._connection() as conn:
            row = conn.execute(
                """
                SELECT 1 FROM ticket_submissions
                WHERE vehicle_id = ? AND session_id = ? AND submit_status = 'created' AND ticket_id IS NOT NULL
                """,
                (vehicle_id, session_id),
            ).fetchone()
        return bool(row)

    def record_submission(
        self,
        draft_id: str,
        vehicle_id: str,
        session_id: str,
        *,
        ticket_id: str | None,
        submit_status: str,
        payload_snapshot: dict,
        error_detail: str | None = None,
    ) -> str:
        local_id = str(uuid.uuid4())
        try:
            with self._connection() as conn:
                conn.execute(
                    """
                    INSERT INTO ticket_submissions
                    (local_id, draft_id, vehicle_id, session_id, ticket_id, submit_status,
                     payload_snapshot, error_detail, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        local_id,
                        draft_id,
                        vehicle_id,
                        session_id,
                        ticket_id,
                        submit_status,
                        json.dumps(payload_snapshot, ensure_ascii=False),
                        error_detail,
                        _now(),
                    ),
                )
                conn.commit()
        except sqlite3.IntegrityError:
            raise
        return local_id

    def log_usage(
        self,
        conversation_id: str | None,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        latency_ms: int,
    ) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO groq_usage (conversation_id, prompt_tokens, completion_tokens, total_tokens, latency_ms, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (conversation_id, prompt_tokens, completion_tokens, total_tokens, latency_ms, _now()),
            )
            conn.commit()

    def list_tickets(self, vehicle_id: str | None = None) -> list[dict]:
        with self._connection() as conn:
            if vehicle_id:
                rows = conn.execute(
                    """
                    SELECT * FROM ticket_submissions
                    WHERE vehicle_id = ? ORDER BY created_at DESC
                    """,
                    (vehicle_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM ticket_submissions ORDER BY created_at DESC LIMIT 50",
                ).fetchall()
        return [dict(row) for row in rows]

    def quarantine_recommendation(self, vehicle_id: str, session_id: str) -> dict | None:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT * FROM chief_quarantine_events WHERE vehicle_id=? AND session_id=? ORDER BY id DESC LIMIT 1",
                (vehicle_id, session_id),
            ).fetchone()
        return dict(row) if row and row["active"] else None

    def record_quarantine_recommendation(self, vehicle_id: str, session_id: str,
                                         active: bool, reason: str, chief_username: str) -> None:
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO chief_quarantine_events(vehicle_id, session_id, active, reason, chief_username, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (vehicle_id, session_id, int(active), reason, chief_username, _now()),
            )


    def recover_interrupted_submissions(self) -> None:
        """Single-worker startup recovery: never resend an interrupted external POST."""
        with self._connection() as conn:
            conn.execute("""
                UPDATE ticket_drafts
                SET status='unknown', updated_at=?
                WHERE draft_id IN (SELECT draft_id FROM ticket_submissions WHERE submit_status='sending')
                  AND status IN ('sending','submitted')
            """, (_now(),))
            conn.execute("UPDATE ticket_submissions SET submit_status='unknown', error_detail='interrupted_process' WHERE submit_status='sending'")
            conn.execute("""
                UPDATE ticket_drafts SET status='draft', updated_at=?
                WHERE status='sending' AND draft_id NOT IN
                    (SELECT draft_id FROM ticket_submissions WHERE submit_status IN ('sending','created','unknown'))
            """, (_now(),))
