"""Generate original test-only text and real PDFs at the catalog's physical pages."""
from pathlib import Path
import os

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from app.rag.catalog import MANUAL_SPECS

PAGES = {
    "y236-re": {
        31: (
            "Для двигателя ЯМЗ-238КМ2 установочный угол опережения впрыскивания равен 10°. "
            "РЕГУЛИРОВКА КЛАПАННОГО МЕХАНИЗМА. Тепловые зазоры регулировать на холодном "
            "двигателе или менее чем через 15 минут после его остановки."
        ),
        33: "Проверьте тепловые зазоры клапанного механизма. Проверьте зазор клапанов контрольным щупом.",
        34: "Проверьте тепловые зазоры клапанного механизма. Измерьте зазор клапанов контрольным щупом.",
        68: "Момент затяжки крышек коренных подшипников. Учебная таблица, значения для реальных двигателей не приводятся.",
    },
    "y236-rk": {
        7: "Давление масла в системе смазки. Масляный насос и редукционный клапан. Проверьте систему смазки двигателя. Проверьте давление открытия редукционного клапана масляного насоса.",
        8: "Масляный насос и редукционный клапан. Проверьте систему смазки двигателя. Проверьте давление открытия редукционного клапана масляного насоса.",
        255: "Проверьте зазоры клапанного механизма контрольным щупом.",
        269: (
            "6.4.1 Проверить и подрегулировать тепловые зазоры клапанного меха-\n"
            "низма перед началом и по окончании обкатки, но не ранее, чем через 15 мин "
            "после остановки двигателя."
        ),
        276: (
            "Примечание - Проверку регулировки зазоров в клапанном механизме производить "
            "на холодном двигателе или не ранее, чем через 15 минут после его остановки."
        ),
    },
    "y536-re": {12: "Система смазки двигателя. Проверьте соединения системы смазки."},
    "z5234-rk": {
        12: "Проверьте свечи зажигания и разъёмы системы зажигания.",
        22: "Сцепление. Выполните осмотр крепления сцепления.",
    },
    "z409-rk": {12: "Зазоры клапанов. Учебный раздел осмотра клапанов."},
}


def generate(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    candidates = [
        os.environ.get("E2E_CYRILLIC_FONT", ""),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    font = next((Path(path) for path in candidates if path and Path(path).is_file()), None)
    if font is None:
        raise RuntimeError("Set E2E_CYRILLIC_FONT to an installed Cyrillic TTF font")
    pdfmetrics.registerFont(TTFont("Fixture", str(font)))
    for spec in MANUAL_SPECS:
        pages = PAGES.get(spec.doc_id, {})
        pdf = Canvas(str(directory / spec.filename), invariant=True)
        for page in range(1, spec.expected_pages + 1):
            pdf.setFont("Fixture", 10)
            pdf.drawString(24, 780, "Синтетический тестовый документ. Технических нормативов для эксплуатации не содержит.")
            pdf.drawString(24, 758, f"Тестовая страница {page}. Текст используется только для проверки программных сценариев.")
            if page in pages:
                from textwrap import wrap
                for line, text in enumerate(wrap(pages[page], width=95)):
                    pdf.drawString(24, 720 - line * 14, text)
            pdf.showPage()
        pdf.save()
