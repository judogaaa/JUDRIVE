from __future__ import annotations

SUPPORTED_LOCALES = frozenset({"ru", "uz", "kk", "tg", "ky", "hi", "bn"})

LOCALE_LABELS: dict[str, str] = {
    "ru": "русский",
    "uz": "узбекский",
    "kk": "казахский",
    "tg": "таджикский",
    "ky": "кыргызский",
    "hi": "хинди",
    "bn": "бенгальский",
}

# ISO 639-1 для Whisper (близкие коды).
WHISPER_LANG: dict[str, str] = {
    "ru": "ru",
    "uz": "uz",
    "kk": "kk",
    "tg": "tg",
    "ky": "ky",
    "hi": "hi",
    "bn": "bn",
}


def normalize_locale(locale: str | None) -> str:
    code = (locale or "ru").strip().lower()
    if code not in SUPPORTED_LOCALES:
        return "ru"
    return code


def agent_language_instruction(locale: str) -> str:
    label = LOCALE_LABELS.get(locale, "русский")
    return (
        f"Язык ответа пользователю: {label} ({locale}). "
        "Пиши ответы на этом языке. "
        "Инструмент search_manuals всегда вызывай с запросом на русском (технические термины). "
        "Не переводи evidence_id, manual, pdf_page, vehicle_id, session_id, коды F01–F14. "
        "Цитаты из руководств оставляй на исходном языке PDF. "
        "Не отправляй заявку по голосовой команде — только черновик, подтверждает механик в UI."
    )