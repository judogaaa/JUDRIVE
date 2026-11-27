from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
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
    fleet_data_path: Path = PROJECT_ROOT / "local-data" / "external" / "vehicles.json"
    pdf_dir: Path = PROJECT_ROOT / "materials" / "manuals"
    db_path: Path = PROJECT_ROOT / "local-data" / "judrive.sqlite"
    api_prefix: str = "/api"

    # Authorization Key from the GigaChat API cabinet (not the short-lived access token).
    gigachat_credentials: str | None = None
    gigachat_scope: str = "GIGACHAT_API_PERS"
    gigachat_base_url: str = "https://api.giga.chat"
    gigachat_auth_url: str = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    gigachat_model: str = "GigaChat-3-Ultra"
    gigachat_stt_model: str = "GigaChat-2-Max"
    gigachat_max_tokens: int = Field(default=1200, gt=0)
    gigachat_request_tokens: int = Field(default=0, ge=0)
    gigachat_voice_reserve_tokens: int = Field(default=128_000, gt=0)
    gigachat_chat_microrub_per_token: int | None = Field(default=None, ge=0)
    gigachat_voice_microrub_per_token: int | None = Field(default=None, ge=0)
    gigachat_request_budget_microrub: int = Field(default=0, ge=0)
    gigachat_daily_budget_microrub: int = Field(default=0, ge=0)
    gigachat_monthly_budget_microrub: int = Field(default=0, ge=0)
    gigachat_timeout_s: float = 60.0
    gigachat_stt_timeout_s: float = 90.0
    gigachat_ca_bundle: Path | None = None
    agent_max_tool_steps: int = 4

    demo_fleet_sha256: str = Field(default="", pattern=r"^(?:[a-f0-9]{64})?$")
    # Optional capability link for invited reviewers; never enables public 123/123.
    jury_access_token_sha256: str = Field(default="", pattern=r"^(?:[a-f0-9]{64})?$")
    jury_access_expires_at: int = Field(default=0, ge=0)
    chief_username: str | None = None
    chief_password_hash: str | None = None
    session_secret: str | None = None
    cookie_secure: bool = False
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    @field_validator("cors_origins")
    @classmethod
    def _validate_origins(cls, value: str) -> str:
        from urllib.parse import urlsplit

        for origin in filter(None, map(str.strip, value.split(","))):
            url = urlsplit(origin)
            if url.scheme not in {"http", "https"} or not url.hostname or url.path or url.query or url.fragment or url.username:
                raise ValueError("CORS_ORIGINS must contain explicit HTTP origins")
        return value

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
