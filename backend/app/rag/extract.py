from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

from app.rag.normalize import non_whitespace_length

logger = logging.getLogger(__name__)

MIN_USEFUL_CHARS = 100


@dataclass(slots=True)
class PageExtract:
    pdf_page: int
    raw_text: str
    extraction: str


def _ocr_page(plumber_page) -> str:
    try:
        import pytesseract  # type: ignore
    except ImportError:
        return ""
    try:
        image = plumber_page.to_image(resolution=200).original
        return pytesseract.image_to_string(image, lang="rus+eng")
    except Exception as exc:  # noqa: BLE001
        logger.debug("OCR skipped: %s", exc)
        return ""


def extract_pdf_pages(pdf_path: Path) -> list[PageExtract]:
    reader = PdfReader(str(pdf_path))
    page_count = len(reader.pages)
    extracts: list[PageExtract] = []

    with pdfplumber.open(str(pdf_path)) as pdf:
        for idx in range(page_count):
            pdf_page = idx + 1
            pypdf_text = reader.pages[idx].extract_text() or ""
            method = "pypdf"
            text = pypdf_text

            if non_whitespace_length(text) < MIN_USEFUL_CHARS and idx < len(pdf.pages):
                plumber_page = pdf.pages[idx]
                plumber_text = plumber_page.extract_text(layout=True) or ""
                if non_whitespace_length(plumber_text) >= non_whitespace_length(text):
                    text = plumber_text
                    method = "pdfplumber"

                if non_whitespace_length(text) < MIN_USEFUL_CHARS:
                    ocr_text = _ocr_page(plumber_page)
                    if non_whitespace_length(ocr_text) > non_whitespace_length(text):
                        text = ocr_text
                        method = "ocr"

            extracts.append(PageExtract(pdf_page=pdf_page, raw_text=text.strip(), extraction=method))
    return extracts