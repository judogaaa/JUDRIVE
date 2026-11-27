#!/usr/bin/env python3
"""Authenticated live GigaChat STT smoke test."""
from __future__ import annotations

import io
import os
import sys
import wave
from getpass import getpass
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.config import get_settings  # noqa: E402

BASE = os.environ.get("JUDRIVE_API_BASE", "http://127.0.0.1:8090")


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


def main() -> int:
    settings = get_settings()
    if not settings.gigachat_credentials:
        print("BLOCKED: добавьте GIGACHAT_CREDENTIALS в локальный .env")
        return 2
    username = settings.chief_username or input("Имя главного механика: ")
    password = getpass("Пароль главного механика: ")
    with httpx.Client(base_url=BASE, timeout=120.0) as client:
        login = client.post("/api/auth/login", json={"username": username, "password": password})
        if login.status_code != 200:
            print(f"BLOCKED: вход chief HTTP {login.status_code}")
            return 2
        response = client.post(
            "/api/voice/transcribe",
            files={"file": ("smoke.wav", make_silent_wav(), "audio/wav")},
            data={"locale": "ru"},
        )
    print(f"HTTP {response.status_code}")
    try:
        body = response.json()
    except Exception:
        print(response.text[:300])
        return 1
    if response.status_code == 200 and body.get("text"):
        print("OK: GigaChat STT returned text")
        return 0
    if response.status_code == 422:
        print("OK: audio reached GigaChat; silent WAV contained no recognizable speech")
        return 0
    if response.status_code in {502, 503, 504}:
        print("FAIL: check GigaChat credentials, model and CA certificates")
        return 2
    print(f"NOTE: unexpected response: {body}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
