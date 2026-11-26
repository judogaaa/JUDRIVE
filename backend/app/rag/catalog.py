from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ManualSpec:
    doc_id: str
    filename: str
    manual_title: str
    engine_models: tuple[str, ...]
    expected_pages: int


MANUAL_SPECS: tuple[ManualSpec, ...] = (
    ManualSpec(
        doc_id="y236-re",
        filename="ЯМЗ_236_руководство по эксплуатации.pdf",
        manual_title="236-3902150-Б РЭ",
        engine_models=("ЯМЗ-236М2",),
        expected_pages=172,
    ),
    ManualSpec(
        doc_id="y236-rk",
        filename="ЯМЗ_236_руководство по РЕМОНТУ.pdf",
        manual_title="236.01.01 РК",
        engine_models=("ЯМЗ-236М2",),
        expected_pages=287,
    ),
    ManualSpec(
        doc_id="y536-re",
        filename="yamz-536_re_2016.pdf",
        manual_title="536.3902150 РЭ",
        engine_models=("ЯМЗ-536",),
        expected_pages=285,
    ),
    ManualSpec(
        doc_id="y536-rk",
        filename="yamz-536_rk_2013.pdf",
        manual_title="536.01.02 РК",
        engine_models=("ЯМЗ-536",),
        expected_pages=603,
    ),
    ManualSpec(
        doc_id="z5234-rk",
        filename="zmz-5234_rk_2025.pdf",
        manual_title="Двигатели ЗМЗ-5234.10 со сцеплением. Руководство по ремонту",
        engine_models=("ЗМЗ-5234.10",),
        expected_pages=158,
    ),
    ManualSpec(
        doc_id="z409-rk",
        filename="zmz-40904-40905_rk_2025.pdf",
        manual_title=(
            "Руководство по эксплуатации, техническому обслуживанию и ремонту "
            "двигателей ЗМЗ-40904.10 и ЗМЗ-40905.10"
        ),
        engine_models=("ЗМЗ-40904.10", "ЗМЗ-40905.10"),
        expected_pages=238,
    ),
)

SPECS_BY_ID = {item.doc_id: item for item in MANUAL_SPECS}
SPECS_BY_FILENAME = {item.filename: item for item in MANUAL_SPECS}


def allowed_doc_ids(engine_model: str) -> list[str]:
    return [spec.doc_id for spec in MANUAL_SPECS if engine_model in spec.engine_models]


def known_engine_models() -> set[str]:
    models: set[str] = set()
    for spec in MANUAL_SPECS:
        models.update(spec.engine_models)
    return models