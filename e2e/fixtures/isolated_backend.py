"""Run production routes against disposable storage and an unauthenticated loopback stub."""
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
        return config.Settings(_env_file=None, groq_api_key=None)

    config.get_settings = isolated_settings
    from app import main
    from app.agent.groq_client import GroqClient

    lifespan = main.app.router.lifespan_context

    @asynccontextmanager
    async def isolated_lifespan(app):
        async with lifespan(app):
            main.agent._groq = lambda: GroqClient(
                None, "e2e", base_url="http://127.0.0.1:8004/openai/v1",
                max_tokens=1200, timeout_s=15,
            )
            main.agent.provider_ready = lambda: True
            yield

    main.app.router.lifespan_context = isolated_lifespan
    uvicorn.run(main.app, host="127.0.0.1", port=8091, log_level="warning")
