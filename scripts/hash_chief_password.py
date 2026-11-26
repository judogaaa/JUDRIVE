#!/usr/bin/env python3
"""Печатает CHIEF_PASSWORD_HASH для .env. Пароль не сохраняется."""
from __future__ import annotations

import getpass
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.auth.chief_session import hash_password  # noqa: E402


def main() -> None:
    password = getpass.getpass("Пароль главного механика: ")
    if len(password) < 10:
        raise SystemExit("Пароль короче 10 символов")
    print(hash_password(password, secrets.token_hex(16)))


if __name__ == "__main__":
    main()
