from __future__ import annotations

import asyncio
import time
import uuid
from pathlib import Path
from typing import Any

import httpx


class GigaChatAPIError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


class GigaChatRateLimitError(GigaChatAPIError):
    pass


class GigaChatAPI:
    """Small async REST client with cached OAuth access tokens.

    The Authorization Key from the GigaChat cabinet is exchanged for a short-lived
    Bearer token. TLS verification stays enabled; install the Minцифры CA bundle
    or pass its path through GIGACHAT_CA_BUNDLE when the host needs it.
    """

    def __init__(
        self,
        credentials: str | None,
        *,
        scope: str = "GIGACHAT_API_PERS",
        base_url: str = "https://api.giga.chat",
        auth_url: str = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
        timeout_s: float = 60.0,
        ca_bundle: Path | str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._credentials = (credentials or "").strip()
        self._scope = scope.strip() or "GIGACHAT_API_PERS"
        self._base_url = base_url.rstrip("/")
        self._auth_url = auth_url
        self._timeout_s = timeout_s
        self._verify: bool | str = str(ca_bundle) if ca_bundle else True
        self._transport = transport
        self._access_token: str | None = None
        self._token_expires_monotonic = 0.0
        self._token_lock = asyncio.Lock()

    @property
    def configured(self) -> bool:
        return bool(self._credentials)

    async def _send(
        self,
        method: str,
        url: str,
        *,
        timeout_s: float | None = None,
        **kwargs: Any,
    ) -> httpx.Response:
        async with httpx.AsyncClient(
            timeout=timeout_s or self._timeout_s,
            verify=self._verify,
            transport=self._transport,
        ) as client:
            return await client.request(method, url, **kwargs)

    @staticmethod
    def _response_message(response: httpx.Response) -> str:
        try:
            body = response.json()
            message = body.get("message") or body.get("detail") or body.get("error")
            if message:
                return str(message)[:300]
        except (ValueError, AttributeError):
            pass
        return response.text[:300] or f"HTTP {response.status_code}"

    async def _get_access_token(self, *, force: bool = False) -> str:
        if not self.configured:
            raise GigaChatAPIError(503, "GIGACHAT_CREDENTIALS is not configured")

        if not force and self._access_token and time.monotonic() < self._token_expires_monotonic:
            return self._access_token

        async with self._token_lock:
            if not force and self._access_token and time.monotonic() < self._token_expires_monotonic:
                return self._access_token

            key = self._credentials
            authorization = key if key.lower().startswith("basic ") else f"Basic {key}"
            response = await self._send(
                "POST",
                self._auth_url,
                timeout_s=min(self._timeout_s, 20.0),
                headers={
                    "Authorization": authorization,
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "RqUID": str(uuid.uuid4()),
                },
                data={"scope": self._scope},
            )
            if response.status_code == 429:
                raise GigaChatRateLimitError(429, "GigaChat OAuth rate limit")
            if response.status_code >= 400:
                raise GigaChatAPIError(response.status_code, self._response_message(response))

            try:
                payload = response.json()
                token = str(payload["access_token"])
            except (ValueError, KeyError, TypeError) as exc:
                raise GigaChatAPIError(502, "GigaChat OAuth returned an invalid token response") from exc

            expires_at = payload.get("expires_at")
            expires_in = payload.get("expires_in")
            if isinstance(expires_at, (int, float)):
                ttl = max(0.0, float(expires_at) - time.time())
            elif isinstance(expires_in, (int, float)):
                ttl = max(0.0, float(expires_in))
            else:
                ttl = 1800.0

            self._access_token = token
            # Refresh one minute before expiry; never keep an already-expired token.
            self._token_expires_monotonic = time.monotonic() + max(1.0, ttl - 60.0)
            return token

    async def request_json(
        self,
        method: str,
        path: str,
        *,
        timeout_s: float | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        token = await self._get_access_token()
        url = f"{self._base_url}/{path.lstrip('/')}"
        extra_headers = kwargs.pop("headers", {}) or {}
        for attempt in range(2):
            response = await self._send(
                method,
                url,
                timeout_s=timeout_s,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    **extra_headers,
                },
                **kwargs,
            )
            if response.status_code == 401 and attempt == 0:
                async with self._token_lock:
                    if self._access_token == token:
                        self._access_token = None
                        self._token_expires_monotonic = 0.0
                token = await self._get_access_token(force=True)
                continue
            if response.status_code == 429:
                raise GigaChatRateLimitError(429, "GigaChat API rate limit")
            if response.status_code >= 400:
                raise GigaChatAPIError(response.status_code, self._response_message(response))
            if response.status_code == 204 or not response.content:
                return {}
            try:
                payload = response.json()
            except ValueError as exc:
                raise GigaChatAPIError(502, "GigaChat API returned invalid JSON") from exc
            if not isinstance(payload, dict):
                raise GigaChatAPIError(502, "GigaChat API returned an unexpected response")
            return payload
        raise GigaChatAPIError(401, "GigaChat access token was rejected")

    async def upload_file(
        self,
        filename: str,
        content: bytes,
        mime_type: str,
        *,
        timeout_s: float | None = None,
    ) -> dict[str, Any]:
        return await self.request_json(
            "POST",
            "/v1/files",
            timeout_s=timeout_s,
            data={"purpose": "general"},
            files={"file": (filename, content, mime_type)},
        )

    async def delete_file(self, file_id: str, *, timeout_s: float | None = None) -> None:
        if not file_id:
            return
        try:
            await self.request_json("POST", f"/v1/files/{file_id}/delete", timeout_s=timeout_s)
        except (GigaChatAPIError, httpx.HTTPError):
            # Cleanup must not hide the transcription result or the original error.
            return
