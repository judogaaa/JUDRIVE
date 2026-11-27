"""Контрольные предметные запросы этапа 02 (docs/ACCEPTANCE.md, docs/MASTER.md)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402
from app.rag.service import AGENT_SEARCH_LIMIT, ManualRagService  # noqa: E402

CASES = [
    {
        "name": "клапанные зазоры ЯМЗ-236М2",
        "engine": "ЯМЗ-236М2",
        "query": "тепловые зазоры клапанного механизма",
        "expect_status": "conflict",
        "expect_pages": {33, 34},
        "expect_conflict_sources": {"y236-re:p0031", "y236-rk:p0269", "y236-rk:p0276"},
        "expect_message_contains": (
            "менее чем через 15 минут",
            "не ранее, чем через 15 минут",
            "сама по себе не подтверждает охлаждение",
            "ЯМЗ-238КМ2",
        ),
        "expect_manual_contains": "236-3902150",
        "forbidden_doc_prefix": "z",
    },
    {
        "name": "момент затяжки коренных крышек ЯМЗ-236М2",
        "engine": "ЯМЗ-236М2",
        "query": "момент затяжки крышек коренных подшипников",
        "expect_status": "ok",
        "expect_pages": {68},
        "expect_manual_contains": "236-3902150",
        "forbidden_doc_prefix": "z",
    },
    {
        "name": "давление масла ЯМЗ-236",
        "engine": "ЯМЗ-236М2",
        "query": "давление масла в системе смазки",
        "expect_status": "ok",
        "forbidden_doc_prefix": "z",
    },
    {
        "name": "неверный двигатель: ЗМЗ-запрос под ЯМЗ-236М2",
        "engine": "ЯМЗ-236М2",
        "query": "гидрокомпенсаторы ЗМЗ-5234",
        "expect_status": "not_found",
    },
    {
        "name": "ЗМЗ-5234 только свои руководства",
        "engine": "ЗМЗ-5234.10",
        "query": "сцепление",
        "expect_status": "ok",
        "forbidden_doc_prefix": "y",
    },
    {
        "name": "ЯМЗ-536 отдельный корпус",
        "engine": "ЯМЗ-536",
        "query": "система смазки",
        "expect_status": "ok",
        "forbidden_doc_prefix": "z",
    },
    {
        "name": "отсутствие информации",
        "engine": "ЯМЗ-236М2",
        "query": "квантовый дилатометр картерных стенок",
        "expect_status": "not_found",
    },
    {
        "name": "ЗМЗ-40905.10 допустимый корпус",
        "engine": "ЗМЗ-40905.10",
        "query": "зазоры клапанов",
        "expect_status": "ok",
        "forbidden_doc_prefix": "y",
    },
]


def main() -> int:
    settings = get_settings()
    service = ManualRagService(settings.db_path, settings.pdf_dir)
    build = service.ensure_index()
    if build.get("missing_files"):
        print("BLOCKED: Missing PDF:", build["missing_files"])
        return 2
    if build.get("built"):
        print("Index built:", build)

    failed = 0
    for case in CASES:
        result = service.search(case["engine"], case["query"], limit=AGENT_SEARCH_LIMIT)
        ok = result["status"] == case["expect_status"]
        pages = {item["pdf_page"] for item in result.get("results", [])}
        docs = {item["doc_id"] for item in result.get("results", [])}
        titles = " | ".join(item["manual_title"] for item in result.get("results", []))

        if case.get("expect_conflict_sources"):
            evidence = {item["evidence_id"] for item in result.get("conflicting_sources", [])}
            ok = ok and evidence == case["expect_conflict_sources"]
        if case.get("expect_message_contains"):
            message = result.get("message") or ""
            if not all(fragment in message for fragment in case["expect_message_contains"]):
                ok = False
        if case.get("expect_pages") and not case["expect_pages"].intersection(pages):
            ok = False
        if case.get("expect_manual_contains"):
            if not any(case["expect_manual_contains"] in item["manual_title"] for item in result.get("results", [])):
                ok = False
        prefix = case.get("forbidden_doc_prefix")
        if prefix and any(doc_id.startswith(prefix) for doc_id in docs):
            ok = False

        status = "OK" if ok else "FAIL"
        if not ok:
            failed += 1
        print(
            f"[{status}] {case['name']}: status={result['status']} pages={sorted(pages)} docs={sorted(docs)}"
        )
        if result.get("message"):
            print("  message:", result["message"][:160])
        if titles:
            print("  titles:", titles[:180])

    print(f"Done. Failed={failed}/{len(CASES)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())