from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    vehicle_id: str = Field(min_length=1)
    session_id: str = Field(min_length=1)


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)