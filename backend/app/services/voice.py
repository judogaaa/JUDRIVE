from __future__ import annotations

from collections.abc import AsyncGenerator
import logging
import time
from typing import Any, Callable

import httpx

from app.services.usage_budget import BudgetExceeded
from fastapi import HTTPException, Request
from starlette.datastructures import FormData, UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from app.agent.locale import LOCALE_LABELS
from app.services.gigachat import GigaChatAPI, GigaChatAPIError, GigaChatRateLimitError

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_AUDIO_REQUEST_BYTES = MAX_AUDIO_BYTES + 16 * 1024
MIME_ALIASES = {
    "audio/webm": ("audio/webm", "speech.webm"),
    "audio/mp4": ("audio/mp4", "speech.mp4"),
    "audio/x-m4a": ("audio/x-m4a", "speech.m4a"),
    "audio/ogg": ("audio/x-ogg", "speech.ogg"),
    "audio/x-ogg": ("audio/x-ogg", "speech.ogg"),
    "audio/wav": ("audio/wav", "speech.wav"),
    "audio/x-wav": ("audio/x-wav", "speech.wav"),
    "audio/wave": ("audio/wav", "speech.wav"),
    "audio/x-pn-wav": ("audio/wav", "speech.wav"),
    "audio/mpeg": ("audio/mp3", "speech.mp3"),
    "audio/mp3": ("audio/mp3", "speech.mp3"),
    "audio/opus": ("audio/opus", "speech.opus"),
}


class _VoiceRequestTooLarge(MultiPartException):
    pass


async def read_voice_form(request: Request) -> FormData:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "multipart/form-data":
        raise HTTPException(status_code=415, detail="Ожидается аудиофайл")

    try:
        declared_size = int(request.headers.get("content-length", "0"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Некорректный размер запроса") from exc
    if declared_size > MAX_AUDIO_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="Аудио слишком большое (макс. 8 МБ)")

    async def bounded_stream() -> AsyncGenerator[bytes, None]:
        received = 0
        async for chunk in request.stream():
            received += len(chunk)
            if received > MAX_AUDIO_REQUEST_BYTES:
                raise _VoiceRequestTooLarge("Audio request too large")
            yield chunk

    try:
        return await MultiPartParser(
            request.headers, bounded_stream(), max_files=1, max_fields=1, max_part_size=32,
        ).parse()
    except _VoiceRequestTooLarge as exc:
        raise HTTPException(status_code=413, detail="Аудио слишком большое (макс. 8 МБ)") from exc
    except MultiPartException as exc:
        raise HTTPException(status_code=400, detail="Некорректная форма загрузки аудио") from exc


def _container_matches(filename: str, data: bytes) -> bool:
    if filename.endswith(".wav"):
        return (len(data) >= 44 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"
                and int.from_bytes(data[4:8], "little") == len(data) - 8
                and b"data" in data[12:])
    if filename.endswith(".webm"):
        return (len(data) > 32 and data.startswith(b"\x1a\x45\xdf\xa3")
                and b"webm" in data[:64] and b"\x1f\x43\xb6\x75" in data)
    if filename.endswith((".mp4", ".m4a")):
        return len(data) >= 24 and data[4:8] == b"ftyp"
    if filename.endswith(".mp3"):
        return len(data) >= 16 and (data.startswith(b"ID3") or (data[0] == 0xff and data[1] & 0xe0 == 0xe0))
    return len(data) >= 28 and data.startswith(b"OggS") and (
        not filename.endswith(".opus") or b"OpusHead" in data[:512]
    )


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
            raise HTTPException(status_code=415, detail="Неподдерживаемый аудиоформат")
        mime, filename = mime_entry
        if not _container_matches(filename, content):
            raise HTTPException(status_code=422, detail="Повреждённый аудиофайл или неверный формат")
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
            choice = choices[0] if isinstance(choices, list) and choices else None
            message = choice.get("message") if isinstance(choice, dict) else None
            transcript = message.get("content") if isinstance(message, dict) else None
            if not isinstance(transcript, str):
                raise GigaChatAPIError(502, "Invalid GigaChat transcription response")
            text = transcript.strip()
            if not text:
                raise HTTPException(status_code=422, detail="Речь не распознана — повторите или введите текст")
            return {"text": text, "language": language}
        except BudgetExceeded as exc:
            raise HTTPException(status_code=429, detail="Достигнут лимит расходов помощника.") from exc
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
