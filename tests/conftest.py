from functools import lru_cache
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "e2e" / "fixtures"))

from app import config


@lru_cache
def test_settings():
    return config.Settings(_env_file=None, gigachat_credentials=None)


config.get_settings = test_settings


@pytest.fixture(scope="session")
def synthetic_rag(tmp_path_factory):
    from synthetic_manuals import generate
    from app.rag.service import ManualRagService

    directory = tmp_path_factory.mktemp("manual-corpus")
    generate(directory / "pdf")
    return ManualRagService(directory / "rag.sqlite", directory / "pdf")


@pytest.fixture
def auth_client(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    from app.auth.chief_session import hash_password

    local = main.get_settings().model_copy(update={
        "chief_username": "tests", "chief_password_hash": hash_password("test-only-password", "test-only-salt"),
        "session_secret": "test-only-session-signing-value", "cookie_secure": False,
    })
    monkeypatch.setattr(main, "get_settings", lambda: local)
    client = TestClient(main.app)
    try:
        result = client.post("/api/auth/login", json={"username": "tests", "password": "test-only-password"})
        assert result.status_code == 200
        yield client
    finally:
        client.close()


def pytest_sessionstart(session):
    """Own both vendor services and all application state for the pytest process."""
    import os
    import socket
    from tempfile import TemporaryDirectory
    from time import monotonic, sleep
    from urllib.request import ProxyHandler, build_opener

    session._judrive_runtime = TemporaryDirectory(prefix="judrive-pytest-")
    session._judrive_processes = []
    os.environ["DB_PATH"] = str(Path(session._judrive_runtime.name) / "app.sqlite")
    opener = build_opener(ProxyHandler({}))
    for variable, module in (("MOCK_ML_URL", "mock_ml.app"), ("MOCK_TOIR_URL", "mock_toir.app")):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", f"{module}:app", "--host", "127.0.0.1", "--port", str(port)],
            cwd=ROOT / "vendor" / "neurodvs_mock",
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        session._judrive_processes.append(process)
        os.environ[variable] = url
        deadline = monotonic() + 15
        while process.poll() is None and monotonic() < deadline:
            try:
                with opener.open(f"{url}/health", timeout=1):
                    break
            except OSError:
                sleep(0.1)
        else:
            pytest_sessionfinish(session)
            raise RuntimeError(f"Local test service {module} did not start")
    test_settings.cache_clear()


def pytest_sessionfinish(session):
    for process in getattr(session, "_judrive_processes", []):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    if hasattr(session, "_judrive_runtime"):
        session._judrive_runtime.cleanup()
