import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.rag.catalog import allowed_doc_ids  # noqa: E402
from app.rag.normalize import fts_query_from_user, normalize_for_fts  # noqa: E402
from app.rag.service import ManualRagService  # noqa: E402


def test_engine_allowlist_is_strict():
    y236 = set(allowed_doc_ids("ЯМЗ-236М2"))
    z5234 = set(allowed_doc_ids("ЗМЗ-5234.10"))
    assert "y236-re" in y236
    assert "z5234-rk" not in y236
    assert z5234 == {"z5234-rk"}


def test_fts_query_builder():
    assert fts_query_from_user("турбокомпрессор") != ""
    assert normalize_for_fts("Ёлка-123") == "елка-123"


def test_manual_index_available(synthetic_rag: ManualRagService):
    info = synthetic_rag.ensure_index()
    assert info.get("built") or info.get("reason") == "up_to_date"
    status = synthetic_rag.status()
    assert status["documents"] == 6
    assert status["pages"] >= 1700


def test_valve_clearance_page_33_34(synthetic_rag: ManualRagService):
    synthetic_rag.ensure_index()
    result = synthetic_rag.search("ЯМЗ-236М2", "тепловые зазоры клапанного механизма", limit=8)
    assert result["status"] == "conflict"
    assert {hit["pdf_page"] for hit in result["conflicting_sources"]} == {31, 269, 276}
    assert "сама по себе не подтверждает охлаждение" in result["message"]
    pages = {hit["pdf_page"] for hit in result["results"]}
    assert pages.intersection({33, 34})
    assert all(hit["doc_id"].startswith("y236") for hit in result["results"])


def test_honest_refusal(synthetic_rag: ManualRagService):
    synthetic_rag.ensure_index()
    result = synthetic_rag.search("ЯМЗ-236М2", "квантовый дилатометр картерных стенок")
    assert result["status"] == "not_found"
    assert "не найдено" in result["message"]

def test_oil_relief_valve_is_not_a_valve_clearance_conflict(synthetic_rag):
    result = synthetic_rag.search("ЯМЗ-236М2", "масляный насос редукционный клапан")
    assert result["status"] == "ok"
    assert {r["evidence_id"] for r in result["results"]} >= {"y236-rk:p0007", "y236-rk:p0008"}
    assert not result["conflicting_sources"]
