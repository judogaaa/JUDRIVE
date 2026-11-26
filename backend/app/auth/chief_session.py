"""Сессия кабинета главного механика. Пароль только как PBKDF2-хеш из окружения."""
from __future__ import annotations

import hashlib
import hmac
import time
from collections import defaultdict

from fastapi import HTTPException, Request, Response

from app.config import Settings

COOKIE = "judrive_chief"
MAX_ATTEMPTS = 5
LOCK_SECONDS = 15 * 60
SESSION_SECONDS = 8 * 3600

_attempts: dict[str, list[float]] = defaultdict(list)


def hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return f"{salt}${digest.hex()}"


def _configured(settings: Settings) -> bool:
    return bool(settings.chief_username and settings.chief_password_hash and settings.session_secret)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _locked(key: str) -> bool:
    now = time.time()
    recent = [stamp for stamp in _attempts[key] if now - stamp < LOCK_SECONDS]
    _attempts[key] = recent
    return len(recent) >= MAX_ATTEMPTS


def _sign(settings: Settings, payload: str) -> str:
    assert settings.session_secret
    return hmac.new(settings.session_secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def issue_session(response: Response, settings: Settings) -> None:
    exp = int(time.time()) + SESSION_SECONDS
    payload = f"chief:{exp}"
    token = f"{payload}.{_sign(settings, payload)}"
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=SESSION_SECONDS,
        path="/",
    )


def clear_session(response: Response, settings: Settings) -> None:
    response.delete_cookie(COOKIE, path="/", secure=settings.cookie_secure, samesite="lax")


def session_ok(request: Request, settings: Settings) -> bool:
    if not _configured(settings):
        return False
    raw = request.cookies.get(COOKIE, "")
    if "." not in raw:
        return False
    payload, sig = raw.rsplit(".", 1)
    if not hmac.compare_digest(sig.encode("utf-8"), _sign(settings, payload).encode("ascii")):
        return False
    try:
        role, exp = payload.split(":", 1)
        return role == "chief" and int(exp) > time.time()
    except ValueError:
        return False


def require_chief(request: Request, settings: Settings) -> None:
    if not _configured(settings):
        raise HTTPException(status_code=503, detail="Доступ главного механика не настроен")
    if not session_ok(request, settings):
        raise HTTPException(status_code=401, detail="Требуется вход")


def login(request: Request, response: Response, settings: Settings, username: str, password: str) -> None:
    if not _configured(settings):
        raise HTTPException(status_code=503, detail="Доступ главного механика не настроен")
    key = _client_key(request)
    if _locked(key):
        raise HTTPException(status_code=429, detail="Слишком много попыток. Повторите позже.")
    stored = settings.chief_password_hash or ""
    ok_user = hmac.compare_digest(username.encode("utf-8"), (settings.chief_username or "").encode("utf-8"))
    ok_pass = False
    if "$" in stored:
        salt, digest = stored.split("$", 1)
        candidate = hash_password(password, salt).split("$", 1)[1]
        ok_pass = hmac.compare_digest(candidate.encode("ascii"), digest.encode("utf-8"))
    if not (ok_user and ok_pass):
        _attempts[key].append(time.time())
        raise HTTPException(status_code=401, detail="Неверное имя или пароль")
    _attempts[key].clear()
    issue_session(response, settings)
