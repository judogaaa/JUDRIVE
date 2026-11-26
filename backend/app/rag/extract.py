from __future__ import annotations

import logging
import shutil
import subprocess
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


def extraction_profile() -> str:
    return "layout-v2-poppler" if shutil.which("pdftotext") else "layout-v2-pypdf"


def _layout_pages(pdf_path: Path, page_count: int) -> list[str] | None:
    if not shutil.which("pdftotext"):
        return None
    try:
        proc = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
                              check=True, capture_output=True, timeout=120)
        pages = proc.stdout.decode("utf-8").split("\f")
        if pages and not pages[-1].strip():
            pages.pop()
        if len(pages) == page_count:
            return pages
    except (OSError, subprocess.SubprocessError, UnicodeError):
        logger.warning("Layout extraction unavailable for %s", pdf_path.name)
    return None


def extract_pdf_pages(pdf_path: Path) -> list[PageExtract]:
    reader = PdfReader(str(pdf_path))
    page_count = len(reader.pages)
    extracts: list[PageExtract] = []
    layout_pages = _layout_pages(pdf_path, page_count)

    with pdfplumber.open(str(pdf_path)) as pdf:
        for idx in range(page_count):
            pdf_page = idx + 1
            if layout_pages is not None:
                text = layout_pages[idx]
                method = "poppler-layout"
            else:
                text = reader.pages[idx].extract_text() or ""
                method = "pypdf"

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