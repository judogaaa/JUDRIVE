"""Run production routes against disposable storage and a local GigaChat API stub."""
from contextlib import asynccontextmanager
from pathlib import Path
import os
import tempfile

import uvicorn

from synthetic_manuals import generate

with tempfile.TemporaryDirectory(prefix="judrive-e2e-") as raw:
    directory = Path(raw)
    os.environ["DB_PATH"] = str(directory / "app.sqlite")
    os.environ["PDF_DIR"] = str(directory / "pdf")
    generate(directory / "pdf")

    from functools import lru_cache
    from app import config

    @lru_cache
    def isolated_settings():
        return config.Settings(
            _env_file=None,
            gigachat_credentials="e2e-test-authorization-key",
            gigachat_scope="GIGACHAT_API_PERS",
            gigachat_base_url="http://127.0.0.1:8004",
            gigachat_auth_url="http://127.0.0.1:8004/api/v2/oauth",
            gigachat_model="e2e-function-stub",
            gigachat_stt_model="e2e-function-stub",
            gigachat_ca_bundle=None,
        )

    config.get_settings = isolated_settings
    from app import main

    lifespan = main.app.router.lifespan_context

    @asynccontextmanager
    async def isolated_lifespan(app):
        async with lifespan(app):
            yield

    main.app.router.lifespan_context = isolated_lifespan
    uvicorn.run(main.app, host="127.0.0.1", port=8091, log_level="warning")
