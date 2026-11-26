from pydantic import BaseModel, Field


class TicketConfirmRequest(BaseModel):
    confirm_nonce: str = Field(min_length=8)
    acknowledge: bool = Field(description="Явное подтверждение механика")