import json
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


def test_voice_transcribe_requires_key():
    client = TestClient(app)
    # Минимальный файл webm-заголовок не обязателен — ожидаем 503 без ключа или 422/502 с ключом
    response = client.post(
        "/api/voice/transcribe",
        files={"file": ("test.webm", b"\x00", "audio/webm")},
        data={"locale": "ru"},
    )
    assert response.status_code in {400, 413, 422, 502, 503}


def test_all_locale_json_have_same_keys_as_ru():
    i18n = ROOT / "frontend" / "src" / "i18n" / "locales"
    ru_keys = set(json.loads((i18n / "ru.json").read_text(encoding="utf-8")).keys())
    for name in ("uz", "kk", "tg", "ky", "hi", "bn"):
        path = i18n / f"{name}.json"
        assert path.is_file(), f"missing {name}.json"
        keys = set(json.loads(path.read_text(encoding="utf-8")).keys())
        assert keys == ru_keys, f"{name}.json keys mismatch: missing {ru_keys - keys}, extra {keys - ru_keys}"


def test_chat_accepts_locale_field():
    client = TestClient(app)
    conv = client.post(
        "/api/conversations",
        json={"vehicle_id": "M333YK47", "session_id": "S-0006", "locale": "uz"},
    )
    assert conv.status_code == 200
    cid = conv.json()["conversation_id"]
    # Пустой ответ без Groq не тестируем; проверяем, что locale в теле принимается схемой
    bad = client.post(f"/api/conversations/{cid}/messages", json={"message": "   ", "locale": "uz"})
    assert bad.status_code == 400