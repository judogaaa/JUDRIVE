from __future__ import annotations

import hashlib
import json

from fastapi import HTTPException

from app.agent.groq_client import GroqClient
from app.agent.locale import agent_language_instruction, normalize_locale
from app.agent.guardrails import sanitize_user_message
from app.agent.tools import TOOL_DEFINITIONS, ToolRuntime
from app.config import Settings
from app.rag.service import ManualRagService
from app.services.fleet import FleetService
from app.services.mock_clients import MockMlClient
from app.storage.repository import AppRepository


class AgentOrchestrator:
    def __init__(
        self,
        settings: Settings,
        fleet: FleetService,
        mock_ml: MockMlClient,
        rag: ManualRagService,
        repo: AppRepository,
    ) -> None:
        self._settings = settings
        self._fleet = fleet
        self._mock_ml = mock_ml
        self._rag = rag
        self._repo = repo

    def _groq(self) -> GroqClient:
        if not self._settings.groq_api_key:
            raise HTTPException(status_code=503, detail="GROQ_API_KEY не настроен")
        return GroqClient(
            self._settings.groq_api_key,
            self._settings.groq_model,
            max_tokens=self._settings.groq_max_tokens,
            timeout_s=self._settings.groq_timeout_s,
        )

    def create_conversation(self, vehicle_id: str, session_id: str) -> dict:
        if not self._fleet.validate_pair(vehicle_id, session_id):
            raise HTTPException(status_code=404, detail="Неизвестная пара ТС/сессия")
        engine = self._fleet.session_engine(vehicle_id, session_id)
        if not engine:
            raise HTTPException(status_code=400, detail="Неизвестный двигатель")
        context_hash = hashlib.sha256(f"{vehicle_id}:{session_id}".encode()).hexdigest()
        cid = self._repo.create_conversation(vehicle_id, session_id, engine, context_hash)
        self._repo.invalidate_drafts_for_context(vehicle_id, session_id)
        return {
            "conversation_id": cid,
            "vehicle_id": vehicle_id,
            "session_id": session_id,
            "engine_model": engine,
        }

    async def send_message(self, conversation_id: str, user_message: str, locale: str = "ru") -> dict:
        conv = self._repo.get_conversation(conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Диалог не найден")

        content = sanitize_user_message(user_message)
        if not content:
            raise HTTPException(status_code=400, detail="Пустое сообщение")

        self._repo.add_message(conversation_id, "user", content)

        runtime = ToolRuntime(
            fleet=self._fleet,
            mock_ml=self._mock_ml,
            rag=self._rag,
            repo=self._repo,
            vehicle_id=conv["vehicle_id"],
            session_id=conv["session_id"],
            engine_model=conv["engine_model"],
            conversation_id=conversation_id,
        )

        history_rows = self._repo.list_messages(conversation_id)
        llm_messages: list[dict] = []
        for row in history_rows[-8:]:
            if row["role"] in {"user", "assistant"}:
                llm_messages.append({"role": row["role"], "content": row["content"]})

        loc = normalize_locale(locale)
        llm_messages.append(
            {
                "role": "system",
                "content": (
                    f"Контекст сессии: vehicle_id={conv['vehicle_id']}, "
                    f"session_id={conv['session_id']}, engine_model={conv['engine_model']}. "
                    f"Исходный вопрос пользователя сохранён; RAG только по русским техтерминам."
                ),
            }
        )
        llm_messages.append({"role": "system", "content": agent_language_instruction(loc)})

        groq = self._groq()
        try:
            reply, tool_trace, usage = await groq.run_with_tools(
                llm_messages,
                TOOL_DEFINITIONS,
                runtime.execute,
                max_steps=self._settings.agent_max_tool_steps,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=429, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Ошибка Groq: {exc}") from exc

        self._repo.log_usage(
            conversation_id,
            usage.get("prompt_tokens", 0),
            usage.get("completion_tokens", 0),
            usage.get("total_tokens", 0),
            usage.get("latency_ms", 0),
        )

        draft_id = runtime.draft["draft_id"] if runtime.draft else None
        self._repo.add_message(
            conversation_id,
            "assistant",
            reply,
            tool_trace=tool_trace,
            sources=runtime.sources,
            draft_id=draft_id,
        )

        return {
            "reply": reply,
            "tool_trace": tool_trace,
            "sources": runtime.sources,
            "draft": runtime.draft,
            "usage": usage,
        }

    def get_conversation_messages(self, conversation_id: str) -> list[dict]:
        rows = self._repo.list_messages(conversation_id)
        out: list[dict] = []
        for row in rows:
            out.append(
                {
                    "id": row["id"],
                    "role": row["role"],
                    "content": row["content"],
                    "tool_trace": json.loads(row["tool_trace"] or "[]"),
                    "sources": json.loads(row["sources"] or "[]"),
                    "draft_id": row["draft_id"],
                    "created_at": row["created_at"],
                }
            )
        return out