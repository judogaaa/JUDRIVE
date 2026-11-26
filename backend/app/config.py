from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _abs_path(value: Path) -> Path:
    return value if value.is_absolute() else (PROJECT_ROOT / value)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mock_ml_url: str = "http://127.0.0.1:8001"
    mock_toir_url: str = "http://127.0.0.1:8002"
    fleet_data_path: Path = PROJECT_ROOT / "vendor" / "neurodvs_mock" / "data" / "vehicles.json"
    pdf_dir: Path = PROJECT_ROOT / "materials" / "manuals"
    db_path: Path = PROJECT_ROOT / "local-data" / "judrive.sqlite"
    api_prefix: str = "/api"

    groq_api_key: str | None = None
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "openai/gpt-oss-120b"
    groq_max_tokens: int = 1200
    groq_timeout_s: float = 60.0
    groq_stt_model: str = "whisper-large-v3-turbo"
    groq_stt_timeout_s: float = 45.0
    agent_max_tool_steps: int = 4

    chief_username: str | None = None
    chief_password_hash: str | None = None
    session_secret: str | None = None
    cookie_secure: bool = False

    @field_validator("fleet_data_path", "pdf_dir", "db_path", mode="before")
    @classmethod
    def _resolve_path(cls, value: object) -> object:
        if isinstance(value, Path):
            return _abs_path(value)
        if isinstance(value, str):
            return str(_abs_path(Path(value)))
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()