import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.agent.presentation import format_answer
from app.agent.evidence import quantities_supported

SOURCE = {"evidence_id": "y236-re:p0034", "manual_title": "РЭ", "pdf_page": 34}


def test_citations_are_normalized_and_deduplicated():
    answer, sources = format_answer("Проверьте по y236-re:p0034. [y236-re:p0034]", [SOURCE, SOURCE])
    assert answer == "Проверьте по [y236-re:p0034]. [y236-re:p0034]"
    assert sources == [SOURCE]


def test_unknown_citation_rejects_answer():
    answer, sources = format_answer("Норматив [unknown:p0042]", [SOURCE])
    assert answer == ""
    assert sources == [SOURCE]


def test_model_urls_never_become_links():
    answer, sources = format_answer("См. [y236-re:p0034](https://example.org/fake) https://example.org/other", [SOURCE])
    assert answer == "См. [y236-re:p0034]"
    assert sources == [SOURCE]


def test_technical_payload_and_unverified_quantity_are_rejected():
    for raw in ("", '{"tool_calls":[]}', "Traceback (most recent call last):", "```json\n{}\n```"):
        assert format_answer(raw, [SOURCE])[0] == ""
    assert not quantities_supported(None, [], "Зазор 0,3 мм")
