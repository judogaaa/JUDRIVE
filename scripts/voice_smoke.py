#!/usr/bin/env python3
"""Live Groq STT smoke: POST /api/voice/transcribe with minimal WAV."""
from __future__ import annotations

import io
import wave

import httpx

BASE = "http://127.0.0.1:8080"


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
    wav = make_silent_wav()
    files = {"file": ("smoke.wav", wav, "audio/wav")}
    data = {"locale": "ru"}
    r = httpx.post(f"{BASE}/api/voice/transcribe", files=files, data=data, timeout=60.0)
    print(f"HTTP {r.status_code}")
    try:
        body = r.json()
    except Exception:
        print(r.text[:500])
        return 1
    print(body)
    if r.status_code == 200 and body.get("text"):
        print("OK: live STT returned text")
        return 0
    if r.status_code == 422:
        print("OK: live STT reached Groq (empty/silent audio — ожидаемо)")
        return 0
    if r.status_code in {502, 503}:
        print("FAIL: STT недоступен")
        return 2
    print("NOTE: unexpected status; проверьте микрофон в браузере")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())