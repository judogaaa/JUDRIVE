from __future__ import annotations

from contextlib import closing, contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime
import json
import logging
from pathlib import Path
import sqlite3
from typing import Iterator

logger = logging.getLogger(__name__)


class BudgetExceeded(RuntimeError):
    pass


@dataclass
class RequestSpend:
    tokens: int = 0
    microrub: int = 0


@dataclass(frozen=True)
class Reservation:
    id: int
    estimate: int
    rate: int
    request: RequestSpend


class UsageBudget:
    """Reserve capacity in SQLite before calling the billable endpoint."""

    def __init__(self, settings):
        self.path: Path = settings.db_path
        self.chat_rate = settings.gigachat_chat_microrub_per_token
        self.voice_rate = settings.gigachat_voice_microrub_per_token
        self.request_tokens = settings.gigachat_request_tokens
        self.voice_reserve = settings.gigachat_voice_reserve_tokens
        self.request_limit = settings.gigachat_request_budget_microrub
        self.daily_limit = settings.gigachat_daily_budget_microrub
        self.monthly_limit = settings.gigachat_monthly_budget_microrub
        self.request_spend: ContextVar[RequestSpend | None] = ContextVar("gigachat_request_spend", default=None)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS llm_budget_reservations (
                    id INTEGER PRIMARY KEY, created_at TEXT NOT NULL,
                    tokens INTEGER NOT NULL, microrub INTEGER NOT NULL
                )
            """)
            db.execute("CREATE INDEX IF NOT EXISTS ix_llm_budget_date ON llm_budget_reservations(created_at)")

    @contextmanager
    def request(self) -> Iterator[None]:
        scope = self.request_spend.set(RequestSpend())
        try:
            yield
        finally:
            self.request_spend.reset(scope)

    def reserve(self, payload: dict) -> Reservation:
        voice = any(message.get("attachments") for message in payload["messages"])
        rate = self.voice_rate if voice else self.chat_rate
        if rate is None and (self.request_limit or self.daily_limit or self.monthly_limit):
            raise BudgetExceeded("Pricing for this operation is required when a cost limit is enabled")
        rate = rate or 0
        # Reserve the serialized request size plus framing and output. Attachments use an
        # explicit reservation because the tokenizer's text endpoint cannot count audio.
        estimate = (self.voice_reserve if voice else
                    len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) + 512)
        estimate += payload["max_tokens"]
        cost = estimate * rate
        request = self.request_spend.get() or RequestSpend()
        now = datetime.now(UTC).isoformat()
        if self.request_tokens and request.tokens + estimate > self.request_tokens:
            raise BudgetExceeded("Request token reservation exceeds limit")
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("BEGIN IMMEDIATE")
            sums = db.execute("""
                SELECT COALESCE(SUM(CASE WHEN created_at >= ? THEN microrub ELSE 0 END), 0),
                       COALESCE(SUM(microrub), 0)
                FROM llm_budget_reservations WHERE created_at >= ?
            """, (now[:10], now[:7])).fetchone()
            for label, consumed, limit in (
                ("request", request.microrub, self.request_limit),
                ("day", sums[0], self.daily_limit),
                ("month", sums[1], self.monthly_limit),
            ):
                if limit and consumed + cost > limit:
                    raise BudgetExceeded(f"GigaChat {label} budget exhausted")
                if limit and (consumed + cost) * 5 >= limit * 4:
                    logger.warning("GigaChat budget at or above 80%% (%s)", label)
            row = db.execute(
                "INSERT INTO llm_budget_reservations(created_at, tokens, microrub) VALUES (?, ?, ?)",
                (now, estimate, cost),
            )
        request.tokens += estimate
        request.microrub += cost
        return Reservation(row.lastrowid, estimate, rate, request)

    def settle(self, reservation: Reservation, tokens: int) -> None:
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("UPDATE llm_budget_reservations SET tokens=?, microrub=? WHERE id=?",
                       (tokens, tokens * reservation.rate, reservation.id))
        delta = tokens - reservation.estimate
        reservation.request.tokens += delta
        reservation.request.microrub += delta * reservation.rate
        if delta > 0:
            logger.warning("GigaChat reported more tokens than reserved")
