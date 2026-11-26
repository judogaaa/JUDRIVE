import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402
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


@pytest.fixture(scope="module")
def rag_service() -> ManualRagService:
    settings = get_settings()
    service = ManualRagService(settings.db_path, settings.pdf_dir)
    return service


def test_manual_index_available(rag_service: ManualRagService):
    if rag_service.status().get("missing_files"):
        pytest.skip("PDF manuals not present in PDF_DIR")
    info = rag_service.ensure_index()
    assert info.get("built") or info.get("reason") == "up_to_date"
    status = rag_service.status()
    assert status["documents"] == 6
    assert status["pages"] >= 1700


def test_valve_clearance_page_33_34(rag_service: ManualRagService):
    if rag_service.status().get("missing_files"):
        pytest.skip("PDF manuals not present")
    rag_service.ensure_index()
    result = rag_service.search("ЯМЗ-236М2", "тепловые зазоры клапанного механизма", limit=8)
    assert result["status"] == "ok"
    pages = {hit["pdf_page"] for hit in result["results"]}
    assert pages.intersection({33, 34})
    assert all(hit["doc_id"].startswith("y236") for hit in result["results"])


def test_honest_refusal(rag_service: ManualRagService):
    if rag_service.status().get("missing_files"):
        pytest.skip("PDF manuals not present")
    rag_service.ensure_index()
    result = rag_service.search("ЯМЗ-236М2", "квантовый дилатометр картерных стенок")
    assert result["status"] == "not_found"
    assert "не найдено" in result["message"]