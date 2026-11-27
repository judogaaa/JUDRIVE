"""Сессия кабинета главного механика. Пароль только как PBKDF2-хеш из окружения."""
from __future__ import annotations

import hashlib
import hmac
import time
from collections import defaultdict
from typing import Literal

from fastapi import HTTPException, Request, Response

from app.config import Settings

COOKIE = "judrive_chief"
SessionRole = Literal["chief", "demo"]
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
    recent = [stamp for stamp in _attempts.get(key, ()) if now - stamp < LOCK_SECONDS]
    if recent:
        _attempts[key] = recent
    else:
        _attempts.pop(key, None)
    return len(recent) >= MAX_ATTEMPTS


def _sign(settings: Settings, payload: str) -> str:
    assert settings.session_secret
    return hmac.new(settings.session_secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def issue_session(response: Response, settings: Settings, role: SessionRole) -> None:
    exp = int(time.time()) + SESSION_SECONDS
    payload = f"v2:{role}:{exp}"
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


def session_role(request: Request, settings: Settings) -> SessionRole | None:
    if not settings.session_secret:
        return None
    raw = request.cookies.get(COOKIE, "")
    if "." not in raw:
        return None
    payload, sig = raw.rsplit(".", 1)
    if not hmac.compare_digest(sig.encode("utf-8"), _sign(settings, payload).encode("ascii")):
        return None
    try:
        version, role, exp = payload.split(":")
        if version != "v2" or int(exp) <= time.time():
            return None
    except ValueError:
        return None
    if role == "demo" or role == "chief" and _configured(settings):
        return role
    return None


def require_chief(request: Request, settings: Settings) -> None:
    role = session_role(request, settings)
    if role == "demo":
        raise HTTPException(status_code=403, detail="Недоступно в деморежиме")
    if not _configured(settings):
        raise HTTPException(status_code=503, detail="Доступ главного механика не настроен")
    if role != "chief":
        raise HTTPException(status_code=401, detail="Требуется вход")


def login(request: Request, response: Response, settings: Settings, username: str, password: str) -> SessionRole:
    if not settings.session_secret:
        raise HTTPException(status_code=503, detail="Авторизация не настроена")
    key = _client_key(request)
    if _locked(key):
        raise HTTPException(status_code=429, detail="Слишком много попыток. Повторите позже.")
    if username == "123" and password == "123":
        issue_session(response, settings, "demo")
        return "demo"
    stored = settings.chief_password_hash or ""
    ok_user = hmac.compare_digest(username.encode("utf-8"), (settings.chief_username or "").encode("utf-8"))
    ok_pass = False
    if "$" in stored:
        salt, digest = stored.split("$", 1)
        candidate = hash_password(password, salt).split("$", 1)[1]
        ok_pass = hmac.compare_digest(candidate.encode("ascii"), digest.encode("utf-8"))
    if not (ok_user and ok_pass) or password == "123":
        _attempts[key].append(time.time())
        raise HTTPException(status_code=401, detail="Неверное имя или пароль")
    _attempts.pop(key, None)
    issue_session(response, settings, "chief")
    return "chief"
