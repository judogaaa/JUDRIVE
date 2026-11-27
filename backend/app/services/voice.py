from __future__ import annotations

import logging
import time
from typing import Any, Callable

import httpx
from fastapi import HTTPException, UploadFile

from app.agent.locale import LOCALE_LABELS
from app.services.gigachat import GigaChatAPI, GigaChatAPIError, GigaChatRateLimitError

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 8 * 1024 * 1024
MIME_ALIASES = {
    "audio/webm": ("audio/webm", "speech.webm"),
    "audio/mp4": ("audio/mp4", "speech.mp4"),
    "audio/x-m4a": ("audio/x-m4a", "speech.m4a"),
    "audio/ogg": ("audio/x-ogg", "speech.ogg"),
    "audio/x-ogg": ("audio/x-ogg", "speech.ogg"),
    "audio/wav": ("audio/wav", "speech.wav"),
    "audio/x-wav": ("audio/x-wav", "speech.wav"),
    "audio/mpeg": ("audio/mp3", "speech.mp3"),
    "audio/mp3": ("audio/mp3", "speech.mp3"),
    "audio/opus": ("audio/opus", "speech.opus"),
}


class VoiceService:
    def __init__(
        self,
        api: GigaChatAPI,
        model: str,
        timeout_s: float,
        *,
        on_usage: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self._api = api
        self._model = model
        self._timeout_s = timeout_s
        self._on_usage = on_usage

    async def _read_audio(self, upload: UploadFile) -> bytes:
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = await upload.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=413, detail="Аудио слишком большое (макс. 8 МБ)")
            chunks.append(chunk)
        return b"".join(chunks)

    async def transcribe(
        self,
        upload: UploadFile,
        *,
        language: str | None = None,
    ) -> dict[str, str | None]:
        if not self._api.configured:
            raise HTTPException(status_code=503, detail="GIGACHAT_CREDENTIALS не настроен для голоса")

        content = await self._read_audio(upload)
        if not content:
            raise HTTPException(status_code=400, detail="Пустой аудиофайл")

        supplied_mime = (upload.content_type or "audio/webm").split(";")[0].strip().lower()
        mime_entry = MIME_ALIASES.get(supplied_mime)
        if not mime_entry:
            raise HTTPException(status_code=415, detail=f"Неподдерживаемый аудиоформат: {supplied_mime}")
        mime, default_filename = mime_entry
        filename = upload.filename or default_filename
        file_id: str | None = None

        language_label = LOCALE_LABELS.get(language or "", "язык оригинала")
        prompt = (
            "Преобразуй приложенную аудиозапись в точную дословную расшифровку речи. "
            "Не пересказывай, не отвечай на вопросы и не добавляй комментарии. "
            "Сохраняй технические термины, числа, обозначения деталей и единицы измерения. "
            "Если фрагмент невозможно разобрать, отметь его как [неразборчиво], не додумывай. "
            f"Предполагаемый язык речи — {language_label}; если речь на другом языке, распознай оригинал. "
            "Верни только текст расшифровки."
        )

        started = time.perf_counter()
        try:
            uploaded = await self._api.upload_file(
                filename,
                content,
                mime,
                timeout_s=self._timeout_s,
            )
            file_id = str(uploaded.get("id") or "")
            if not file_id:
                raise GigaChatAPIError(502, "GigaChat did not return an uploaded file id")

            result = await self._api.request_json(
                "POST",
                "/v1/chat/completions",
                timeout_s=self._timeout_s,
                json={
                    "model": self._model,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt,
                            "attachments": [file_id],
                        }
                    ],
                    "function_call": "auto",
                    "temperature": 0.1,
                    "max_tokens": 1200,
                },
            )
            usage = result.get("usage") or {}
            if usage and self._on_usage:
                self._on_usage({**usage, "latency_ms": int((time.perf_counter() - started) * 1000)})

            choices = result.get("choices")
            message = choices[0].get("message", {}) if isinstance(choices, list) and choices else {}
            text = str(message.get("content") or "").strip() if isinstance(message, dict) else ""
            if not text:
                raise HTTPException(status_code=422, detail="Речь не распознана — повторите или введите текст")
            return {"text": text, "language": language}
        except GigaChatRateLimitError as exc:
            raise HTTPException(status_code=429, detail="Лимит запросов GigaChat. Повторите позже.") from exc
        except GigaChatAPIError as exc:
            if exc.status_code in {401, 403}:
                raise HTTPException(status_code=503, detail="GigaChat не принял ключ или scope API.") from exc
            logger.warning("GigaChat STT failed (HTTP %s)", exc.status_code)
            raise HTTPException(status_code=502, detail="Не удалось распознать аудио через GigaChat.") from exc
        except httpx.TimeoutException as exc:
            raise HTTPException(status_code=504, detail="GigaChat не успел обработать аудио. Повторите позже.") from exc
        except httpx.HTTPError as exc:
            logger.warning("GigaChat STT transport failed (%s)", type(exc).__name__)
            raise HTTPException(status_code=502, detail="Сервис распознавания GigaChat недоступен.") from exc
        finally:
            if file_id:
                await self._api.delete_file(file_id, timeout_s=self._timeout_s)
