#!/usr/bin/env python3
"""Authenticated live GigaChat STT smoke test; pass --audio for a real transcript."""
from __future__ import annotations

import argparse
import io
import os
import sys
import wave
from getpass import getpass
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.config import get_settings  # noqa: E402

BASE = os.environ.get("JUDRIVE_API_BASE", "http://127.0.0.1:8090")
MIME_BY_SUFFIX = {
    ".webm": "audio/webm",
    ".mp4": "audio/mp4",
    ".m4a": "audio/x-m4a",
    ".ogg": "audio/x-ogg",
    ".opus": "audio/opus",
    ".wav": "audio/wav",
    ".mp3": "audio/mp3",
}


def make_silent_wav(seconds: float = 0.4) -> bytes:
    rate = 16_000
    frames = int(rate * seconds)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * frames)
    return buf.getvalue()


def is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Проверка GigaChat STT")
    parser.add_argument("--audio", type=Path, help="Реальная запись речи (webm/mp4/m4a/ogg/opus/wav/mp3), до 8 МБ")
    parser.add_argument("--locale", default="ru", help="Язык интерфейса/подсказки, например ru или kk")
    args = parser.parse_args()

    try:
        target = urlsplit(BASE)
        local = is_loopback(target.hostname or "")
        valid = (target.hostname and target.username is None and target.password is None
                 and (target.scheme == "https" or (target.scheme == "http" and local)))
    except ValueError:
        valid = False
    if not valid:
        print("BLOCKED: удалённый JUDRIVE_API_BASE должен использовать HTTPS")
        return 2

    settings = get_settings()
    if not settings.gigachat_credentials:
        print("BLOCKED: добавьте GIGACHAT_CREDENTIALS в локальный .env")
        return 2

    if args.audio:
        if not args.audio.is_file():
            print(f"BLOCKED: файл не найден: {args.audio}")
            return 2
        mime = MIME_BY_SUFFIX.get(args.audio.suffix.lower())
        if not mime:
            print("BLOCKED: неподдерживаемое расширение аудио")
            return 2
        audio = args.audio.read_bytes()
        filename = args.audio.name
        if not audio or len(audio) > 8 * 1024 * 1024:
            print("BLOCKED: аудиофайл пустой или больше 8 МБ")
            return 2
    else:
        audio = make_silent_wav()
        filename = "silent-smoke.wav"
        mime = "audio/wav"

    username = settings.chief_username or input("Имя главного механика: ")
    password = getpass("Пароль главного механика: ")
    with httpx.Client(base_url=BASE, timeout=120.0, trust_env=not local, follow_redirects=False) as client:
        login = client.post("/api/auth/login", json={"username": username, "password": password})
        if login.status_code != 200:
            print(f"BLOCKED: вход chief HTTP {login.status_code}")
            return 2
        response = client.post(
            "/api/voice/transcribe",
            files={"file": (filename, audio, mime)},
            data={"locale": args.locale},
        )
    print(f"HTTP {response.status_code}")
    try:
        body = response.json()
    except ValueError:
        print("FAIL: голосовой endpoint вернул ответ в неожиданном формате")
        return 1
    if not isinstance(body, dict):
        print("FAIL: голосовой endpoint вернул ответ в неожиданном формате")
        return 1
    if response.status_code == 200 and body.get("text"):
        print("OK: GigaChat STT returned transcript")
        return 0
    if (response.status_code == 422 and not args.audio
            and body.get("detail") == "Речь не распознана — повторите или введите текст"):
        print("OK: audio upload/completion path reached GigaChat; silence contains no speech")
        print("Для проверки распознавания передайте реальную запись через --audio.")
        return 0
    if response.status_code in {502, 503, 504}:
        print("FAIL: check GigaChat credentials, model and CA certificates")
        return 2
    print("FAIL: unexpected response")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
