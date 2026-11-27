import json
import re
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.agent.locale import SUPPORTED_LOCALES, agent_language_instruction, normalize_locale  # noqa: E402
from app.main import app  # noqa: E402


def test_supported_locales():
    assert len(SUPPORTED_LOCALES) == 7
    assert normalize_locale("xx") == "ru"
    assert "русском" in agent_language_instruction("ru") or "search_manuals" in agent_language_instruction("ru")


def test_voice_transcribe_requires_key(auth_client):
    client = auth_client
    # Голосовой endpoint закрыт сессией механика; без GigaChat credentials вернёт 503.
    response = client.post(
        "/api/voice/transcribe",
        files={"file": ("test.webm", b"\x00", "audio/webm")},
        data={"locale": "ru"},
    )
    assert response.status_code == 503


def test_all_locale_json_have_same_keys_as_ru():
    i18n = ROOT / "frontend" / "src" / "i18n" / "locales"
    ru_keys = set(json.loads((i18n / "ru.json").read_text(encoding="utf-8")).keys())
    for name in ("uz", "kk", "tg", "ky", "hi", "bn"):
        path = i18n / f"{name}.json"
        assert path.is_file(), f"missing {name}.json"
        keys = set(json.loads(path.read_text(encoding="utf-8")).keys())
        assert keys == ru_keys, f"{name}.json keys mismatch: missing {ru_keys - keys}, extra {keys - ru_keys}"


def test_core_locale_strings_are_translated_not_fallback():
    i18n = ROOT / "frontend" / "src" / "i18n" / "locales"
    data = {name: json.loads((i18n / f"{name}.json").read_text(encoding="utf-8"))
            for name in ("uz", "kk", "tg", "ky", "hi", "bn")}
    core = ("diag.run", "verdict.failed.title", "verdict.empty.title", "verdict.score",
            "verdict.signal", "chat.title", "history.title", "chat.send")
    for name in ("kk", "tg", "ky", "hi", "bn"):
        for key in core:
            assert data[name][key] != data["uz"][key], f"{name}/{key} still uses Uzbek fallback"
            assert "Ð" not in data[name][key], f"{name}/{key} contains mojibake"
        if name == "hi":
            assert any("\u0900" <= char <= "\u097f" for char in data[name]["chat.title"])
        if name == "bn":
            assert any("\u0980" <= char <= "\u09ff" for char in data[name]["chat.title"])


def test_locale_values_have_no_placeholder_or_mojibake_artifacts():
    i18n = ROOT / "frontend" / "src" / "i18n" / "locales"
    for name in ("ru", "uz", "kk", "tg", "ky", "hi", "bn"):
        data = json.loads((i18n / f"{name}.json").read_text(encoding="utf-8"))
        for key, value in data.items():
            text = str(value)
            assert not re.search(r"__[^_]{1,10}__", text), f"{name}/{key} leaked a translation placeholder: {text!r}"
            assert "\ufffd" not in text, f"{name}/{key} contains replacement characters: {text!r}"
            assert "Ð" not in text, f"{name}/{key} contains mojibake: {text!r}"


def test_chat_accepts_locale_field(auth_client):
    client = auth_client
    conv = client.post(
        "/api/conversations",
        json={"vehicle_id": "M333YK47", "session_id": "S-0006", "locale": "uz"},
    )
    assert conv.status_code == 200
    cid = conv.json()["conversation_id"]
    # Пустой ответ без GigaChat не тестируем; проверяем, что locale в теле принимается схемой
    bad = client.post(f"/api/conversations/{cid}/messages", json={"message": "   ", "locale": "uz"})
    assert bad.status_code == 400