#!/usr/bin/env python3
"""Контрольные сценарии этапа 03: Mock ML + live Groq agent (ключ только из .env)."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402

DEFAULT_BASE = os.environ.get("JUDRIVE_API_BASE", "http://127.0.0.1:8090")


@dataclass
class ScenarioResult:
    name: str
    ok: bool
    notes: list[str] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)


async def post_json(client: httpx.AsyncClient, path: str, body: dict) -> tuple[int, dict]:
    response = await client.post(path, json=body)
    try:
        payload = response.json()
    except json.JSONDecodeError:
        payload = {"raw": response.text}
    return response.status_code, payload


async def run_scenario(
    client: httpx.AsyncClient,
    *,
    label: str,
    vehicle_id: str,
    session_id: str,
    expected_status: str,
    user_message: str,
    expect_draft: bool,
    try_confirm: bool,
) -> ScenarioResult:
    result = ScenarioResult(name=label, ok=True)

    code, diag = await post_json(
        client,
        "/api/diagnose",
        {"vehicle_id": vehicle_id, "session_id": session_id},
    )
    if code != 200:
        result.ok = False
        result.notes.append(f"diagnose HTTP {code}")
        return result
    if diag.get("status") != expected_status:
        result.ok = False
        result.notes.append(f"ожидали status={expected_status}, получили {diag.get('status')}")
    if expected_status == "check_failed":
        if diag.get("anomaly_score") is not None or diag.get("confidence") is not None:
            result.ok = False
            result.notes.append("scores должны быть null при check_failed")

    code, conv = await post_json(
        client,
        "/api/conversations",
        {"vehicle_id": vehicle_id, "session_id": session_id},
    )
    if code != 200:
        result.ok = False
        result.notes.append(f"conversation HTTP {code}")
        return result
    cid = conv["conversation_id"]

    code, reply = await post_json(
        client,
        f"/api/conversations/{cid}/messages",
        {"message": user_message},
    )
    if code != 200:
        result.ok = False
        result.notes.append(f"chat HTTP {code}: {reply.get('detail', reply)}")
        return result

    usage = reply.get("usage") or {}
    result.usage = {
        "prompt_tokens": int(usage.get("prompt_tokens", 0)),
        "completion_tokens": int(usage.get("completion_tokens", 0)),
        "total_tokens": int(usage.get("total_tokens", 0)),
    }

    tools = [t.get("tool") for t in reply.get("tool_trace") or []]
    if "get_diagnosis" not in tools:
        result.notes.append("предупреждение: агент не вызывал get_diagnosis явно")

    draft = reply.get("draft")
    if expect_draft:
        if not draft or not draft.get("draft_id"):
            result.ok = False
            result.notes.append("ожидался черновик заявки")
        else:
            result.notes.append(f"черновик {draft['draft_id'][:8]}…")
            if try_confirm and draft.get("confirm_nonce"):
                confirm_code, confirm_body = await post_json(
                    client,
                    f"/api/tickets/drafts/{draft['draft_id']}/confirm",
                    {"confirm_nonce": draft["confirm_nonce"], "acknowledge": True},
                )
                if confirm_code != 200:
                    result.ok = False
                    result.notes.append(f"confirm HTTP {confirm_code}")
                elif confirm_body.get("status") == "created":
                    result.ok = bool(confirm_body.get("ticket_id")) and result.ok
                    result.notes.append(f"TKT {confirm_body.get('ticket_id')}")
                elif confirm_body.get("status") == "duplicate":
                    tid = confirm_body.get("ticket_id")
                    suffix = f" TKT {tid}" if tid else ""
                    result.notes.append(
                        f"заявка уже существовала (duplicate){suffix} — допустимо при повторном прогоне"
                    )
                else:
                    result.ok = False
                    result.notes.append(f"confirm: {confirm_body.get('status')} {confirm_body.get('message', '')}")
    elif draft:
        result.ok = False
        result.notes.append("черновик не ожидался, но получен")

    if label.startswith("C2") and "недостаточно" not in str(reply.get("reply", "")).lower():
        result.ok = False
        result.notes.append("С2: ожидался честный ответ о недостаточности данных")
    if reply.get("reply"):
        result.notes.append(f"ответ: {str(reply['reply'])[:140]}…")

    return result


def sum_groq_usage(db_path: Path) -> dict[str, int]:
    if not db_path.is_file():
        return {"rows": 0, "total_tokens": 0}
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(total_tokens), 0) FROM groq_usage",
        ).fetchone()
    return {"rows": int(row[0]), "total_tokens": int(row[1])}


async def main() -> int:
    parser = argparse.ArgumentParser(description="Проверка сценариев агента JUDRIVE")
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    parser.add_argument(
        "--only",
        choices=("normal", "anomaly", "check_failed", "drive_permission"),
        help="Выполнить один сценарий (например anomaly — B418HK98/S-0009 + TKT)",
    )
    parser.add_argument("--confirm", action="store_true", help="Явно разрешить создание тестовой заявки в Mock ТОиР")
    args = parser.parse_args()

    get_settings.cache_clear()
    settings = get_settings()
    if not settings.groq_api_key and args.only not in {"check_failed", "drive_permission"}:
        print("FAIL: GROQ_API_KEY не загружен из .env")
        return 2

    async with httpx.AsyncClient(base_url=args.base_url, timeout=120.0) as client:
        health = await client.get("/api/health")
        if health.status_code != 200:
            print(f"FAIL: backend {args.base_url} недоступен")
            return 2
        h = health.json()
        print(
            f"health: {h.get('status')} ml={h.get('mock_ml')} toir={h.get('mock_toir')} "
            f"manuals={h.get('manuals_index')} groq={h.get('groq_agent')}"
        )

        scenarios_spec = {
            "normal": dict(label="normal M333YK47/S-0006", vehicle_id="M333YK47",
                session_id="S-0006", expected_status="normal",
                user_message="Вызови диагностику и кратко объясни результат. Норма — не гарантия исправности. Нужна ли заявка ТОиР?",
                expect_draft=False, try_confirm=False),
            "anomaly": dict(label="C1 anomaly B418HK98/S-0009", vehicle_id="B418HK98",
                session_id="S-0009", expected_status="anomaly",
                user_message="Есть отклонение по этой сессии. Найди в руководстве ЯМЗ-236 процедуру проверки тепловых зазоров клапанного механизма и подготовь черновик заявки с реальными evidence_id.",
                expect_draft=True, try_confirm=args.confirm),
            "drive_permission": dict(label="C2 перегон B418HK98/S-0009", vehicle_id="B418HK98",
                session_id="S-0009", expected_status="anomaly",
                user_message="Можно ли своим ходом перегнать машину на базу?",
                expect_draft=False, try_confirm=False),
            "check_failed": dict(label="C3 P456AT178/S-0003", vehicle_id="P456AT178",
                session_id="S-0003", expected_status="check_failed",
                user_message="Запись непригодна. Что делать механику? Можно ли оформить заявку на дефектовку?",
                expect_draft=False, try_confirm=False),
        }
        scenarios = []
        for key, spec in scenarios_spec.items():
            if args.only and key != args.only:
                continue
            scenarios.append(await run_scenario(client, **spec))

    usage_totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    failed = 0
    for s in scenarios:
        usage_totals["prompt_tokens"] += s.usage.get("prompt_tokens", 0)
        usage_totals["completion_tokens"] += s.usage.get("completion_tokens", 0)
        usage_totals["total_tokens"] += s.usage.get("total_tokens", 0)
        mark = "OK" if s.ok else "FAIL"
        if not s.ok:
            failed += 1
        print(f"\n[{mark}] {s.name}")
        for note in s.notes:
            print(f"  - {note}")
        if s.usage:
            print(f"  tokens: {s.usage}")

    db_usage = sum_groq_usage(settings.db_path)
    print(f"\nGroq usage в SQLite: {db_usage['rows']} записей, Σ total_tokens={db_usage['total_tokens']}")
    print(f"Сумма токенов за прогон сценариев: {usage_totals}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))