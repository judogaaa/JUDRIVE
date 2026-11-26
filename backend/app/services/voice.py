from __future__ import annotations

import httpx
from fastapi import HTTPException, UploadFile

MAX_AUDIO_BYTES = 8 * 1024 * 1024
ALLOWED_MIME = {
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/mpeg",
    "audio/mp4",
    "video/webm",
}


class VoiceService:
    def __init__(self, api_key: str | None, model: str, timeout_s: float) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout_s = timeout_s
        self._base = "https://api.groq.com/openai/v1"

    async def transcribe(
        self,
        upload: UploadFile,
        *,
        language: str | None = None,
    ) -> dict[str, str | None]:
        if not self._api_key:
            raise HTTPException(status_code=503, detail="GROQ_API_KEY не настроен для голоса")

        content = await upload.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Пустой аудиофайл")
        if len(content) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Аудио слишком большое (макс. 8 МБ)")

        mime = (upload.content_type or "audio/webm").split(";")[0].strip().lower()
        if mime not in ALLOWED_MIME:
            raise HTTPException(status_code=415, detail=f"Неподдерживаемый формат: {mime}")

        filename = upload.filename or "speech.webm"

        data = {"model": self._model}
        if language:
            data["language"] = language

        files = {"file": (filename, content, mime)}

        try:
            async with httpx.AsyncClient(timeout=self._timeout_s) as client:
                response = await client.post(
                    f"{self._base}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    data=data,
                    files=files,
                )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="Сеть Groq STT недоступна") from exc

        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="Groq STT rate limit")
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Groq STT: {response.text[:300]}")

        payload = response.json()
        text = str(payload.get("text", "")).strip()
        if not text:
            raise HTTPException(status_code=422, detail="Речь не распознана — повторите или введите текст")
        return {"text": text, "language": language}