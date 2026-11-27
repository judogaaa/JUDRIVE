from __future__ import annotations

import re

from app.rag.normalize import normalize_for_fts
from app.rag.catalog import SPECS_BY_ID
from app.rag.service import ManualRagService


def resolve_evidence_ids(rag: ManualRagService, evidence_ids: list[str]) -> tuple[list[dict], list[str]]:
    resolved: list[dict] = []
    errors: list[str] = []
    if len(evidence_ids) > 8:
        return [], ["Слишком много источников: максимум 8 страниц"]
    for eid in dict.fromkeys(evidence_ids):
        row = rag.get_evidence(eid)
        spec = SPECS_BY_ID.get(row["doc_id"]) if row else None
        if not row or not spec or not 1 <= row["pdf_page"] <= spec.expected_pages or row["manual_title"] != spec.manual_title or eid != f'{spec.doc_id}:p{row["pdf_page"]:04d}':
            errors.append(f"Неизвестный evidence_id: {eid}")
            continue
        resolved.append(
            {
                "evidence_id": row["evidence_id"],
                "manual_title": row["manual_title"],
                "pdf_page": row["pdf_page"],
                "quote": (row["quote"] or "")[:600],
                "doc_id": row["doc_id"],
            }
        )
    return resolved, errors


def to_ticket_references(resolved: list[dict]) -> list[dict]:
    refs: list[dict] = []
    for item in resolved:
        title = item["manual_title"]
        refs.append({"manual": title, "pdf_page": int(item["pdf_page"])})
    return refs


def references_allowed_for_engine(resolved: list[dict], engine_model: str) -> bool:
    for item in resolved:
        doc_id = item.get("doc_id", "")
        spec = SPECS_BY_ID.get(doc_id)
        if not spec:
            return False
        if engine_model not in spec.engine_models:
            return False
    return bool(resolved)

# A conservative lexical gate, not a substitute for specialist review.
_GENERIC = ("провер", "осмотр", "руковод", "соглас", "выполн", "провест",
            "необходим", "контрол", "регламент", "состояни", "процедур",
            "выполнен", "работ", "порядок", "применим", "документ", "измер",
            "повтор", "следующ", "соответ", "требует", "рекоменд", "двигател")

def unsupported_claims(rag: ManualRagService, resolved: list[dict], claims: list[str]) -> list[str]:
    """Each proposed item needs substantive term and number support on one cited page.
    This deliberately rejects unsupported paraphrases; it is not semantic proof.
    """
    pages = []
    for source in resolved:
        page = rag.get_evidence(source["evidence_id"], full_text=True)
        if page:
            raw = page["quote"].replace(",", ".")
            pages.append((normalize_for_fts(raw), set(re.findall(r"\d+(?:\.\d+)?", raw))))
    missing = []
    for claim in claims:
        terms = {w for w in normalize_for_fts(claim).split()
                 if len(w) >= 4 and not w.isdigit() and not w.startswith(_GENERIC)}
        # "Тепловой зазор клапанов" is the conventional name of the
        # "зазор клапанного механизма" explicitly described on the procedure page.
        if any(w.startswith("зазор") for w in terms) and any(w.startswith("клапан") for w in terms):
            terms = {w for w in terms if not w.startswith("теплов")}
        numbers = set(re.findall(r"\d+(?:\.\d+)?", claim.replace(",", ".")))
        if not terms or not any(
            all((term[:5] if len(term) > 5 else term) in page for term in terms)
            and numbers <= page_numbers
            for page, page_numbers in pages
        ):
            missing.append(claim)
    if not quantities_supported(rag, resolved, "\n".join(claims)):
        return claims
    return missing


_QUANTITY = re.compile(r"(?<![\w.])((?:\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?)\s*(?:н[·⋅.\s-]*м|nm\b|кгс[·⋅.\s-]*м|мм\b|mm\b|мпа\b|mpa\b|бар\b|bar\b|об/мин|rpm\b)", re.IGNORECASE)


def quantities_supported(rag: ManualRagService, sources: list[dict], answer: str) -> bool:
    """Exact numeric range checks; never claim that this proves row-level semantics."""
    def compact(v: str) -> str:
        v = v.lower().replace(",", ".").replace("–", "-").replace("—", "-")
        v = re.sub(r"н[·⋅.\s-]*м", "nm", v)
        for source, target in (("мм", "mm"), ("мпа", "mpa"), ("бар", "bar"), ("об/мин", "rpm")):
            v = v.replace(source, target)
        return re.sub(r"\s+", "", v)
    numbers = [compact(m.group()) for m in _QUANTITY.finditer(answer)]
    if not numbers:
        return True
    supported = set()
    for source in sources:
        row = rag.get_evidence(source["evidence_id"], full_text=True)
        # Layout-sensitive numerical assertions need a reliable extraction.
        if row and row.get("extraction") == "poppler-layout":
            supported.update(compact(match.group()) for match in _QUANTITY.finditer(row["quote"]))
    return set(numbers) <= supported


_NODE_TERMS = {
    "F01": ("клапан",), "F02": ("масл", "смазк"), "F03": ("охлажд", "радиатор"),
    "F04": ("ремен", "ремн"), "F05": ("генератор",), "F06": ("сцеплен",),
    "F07": ("передач",), "F08": ("топлив", "тнвд", "форсунк"),
    "F09": ("турб", "наддув"), "F12": ("зажиган", "свеч"), "F13": ("топлив", "бензин"),
    "F14": ("цеп", "гидронатяж"),
}
_PROCEDURE = re.compile(r"проверьте|проверить|отрегулируйте|отрегулировать|измерьте|измерить|установите|снимите|закрепите|замените|проверяют|регулируют", re.I)


def has_node_procedure(rag: ManualRagService, resolved: list[dict], code: str) -> bool:
    terms = _NODE_TERMS.get(code, ())
    for ref in resolved:
        page = rag.get_evidence(ref["evidence_id"], full_text=True)
        if not page or page.get("extraction") in {"ocr", "sparse"}:
            continue
        text = page["quote"].lower()
        for instruction in _PROCEDURE.finditer(text):
            nearby = text[max(0, instruction.start() - 220):instruction.end() + 220]
            if not any(term in nearby for term in terms):
                continue
            if code == "F01" and not ("зазор" in nearby or "клапанного механизма" in nearby):
                continue
            if code == "F02" and not any(word in nearby for word in ("давлен", "насос", "смазк")):
                continue
            return True
    return False


def operating_prohibition(page: dict | None) -> str | None:
    if not page or page.get("extraction") == "ocr":
        return None
    excerpt = re.search(
        r"(?i)(?:^|(?<=[.!?])\s+)(?:эксплуатация[^.!?]{0,130}запрещена|"
        r"запрещается\s+эксплуатировать)[^.!?]{0,180}[.!?]",
        page["quote"],
    )
    return " ".join(excerpt.group().split()) if excerpt else None
