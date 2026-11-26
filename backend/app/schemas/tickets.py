from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TicketConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm_nonce: str = Field(min_length=8)
    acknowledge: bool = Field(strict=True, description="Явное подтверждение механика")
    warning_acknowledged: bool = Field(default=False, strict=True)
    urgency: Literal["low", "medium", "high"] | None = None