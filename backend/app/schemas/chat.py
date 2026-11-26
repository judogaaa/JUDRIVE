from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    vehicle_id: str = Field(min_length=1)
    session_id: str = Field(min_length=1)
    locale: str = Field(default="ru", max_length=8)


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    locale: str = Field(default="ru", max_length=8)
    analysis_only: bool = False