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

    # Authorization Key from the GigaChat API cabinet (not the short-lived access token).
    gigachat_credentials: str | None = None
    gigachat_scope: str = "GIGACHAT_API_PERS"
    gigachat_base_url: str = "https://api.giga.chat"
    gigachat_auth_url: str = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    gigachat_model: str = "GigaChat-2-Max"
    gigachat_stt_model: str = "GigaChat-2-Max"
    gigachat_max_tokens: int = 1200
    gigachat_timeout_s: float = 60.0
    gigachat_stt_timeout_s: float = 90.0
    gigachat_ca_bundle: Path | None = None
    agent_max_tool_steps: int = 4

    chief_username: str | None = None
    chief_password_hash: str | None = None
    session_secret: str | None = None
    cookie_secure: bool = False

    @field_validator("fleet_data_path", "pdf_dir", "db_path", "gigachat_ca_bundle", mode="before")
    @classmethod
    def _resolve_path(cls, value: object) -> object:
        if value is None or value == "":
            return None if value == "" else value
        if isinstance(value, Path):
            return _abs_path(value)
        if isinstance(value, str):
            return str(_abs_path(Path(value)))
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
