from __future__ import annotations

import json
import time
from typing import Any, Awaitable, Callable

from app.agent.prompts import SYSTEM_PROMPT
from app.services.gigachat import GigaChatAPI, GigaChatAPIError, GigaChatRateLimitError

ExecuteTool = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]


def _clean_schema(value: Any) -> Any:
    if isinstance(value, dict):
        # GigaChat documents a JSON Schema subset; additionalProperties is
        # enforced by ToolRuntime, so omit this OpenAI-specific keyword.
        return {key: _clean_schema(item) for key, item in value.items() if key != "additionalProperties"}
    if isinstance(value, list):
        return [_clean_schema(item) for item in value]
    return value


def gigachat_functions(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    functions: list[dict[str, Any]] = []
    for item in tools:
        function = item.get("function") if isinstance(item, dict) else None
        if not isinstance(function, dict):
            continue
        name = function.get("name")
        if not isinstance(name, str) or not name:
            continue
        functions.append(
            {
                "name": name,
                "description": str(function.get("description") or ""),
                "parameters": _clean_schema(function.get("parameters") or {
                    "type": "object",
                    "properties": {},
                }),
            }
        )
    return functions


class GigaChatAgentClient:
    """GigaChat native function-calling adapter for the JUDRIVE tool runtime."""

    def __init__(
        self,
        api: GigaChatAPI,
        model: str,
        *,
        max_tokens: int,
        timeout_s: float,
    ) -> None:
        self._api = api
        self._model = model
        self._max_tokens = max_tokens
        self._timeout_s = timeout_s
        self.on_usage: Callable[[str, dict[str, Any]], None] | None = None

    async def run_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        execute_tool: ExecuteTool,
        *,
        max_steps: int = 4,
    ) -> tuple[str, list[dict[str, Any]], dict[str, int]]:
        tool_trace: list[dict[str, Any]] = []
        instructions = [SYSTEM_PROMPT]
        transcript = []
        for message in messages:
            if message["role"] == "system":
                instructions.append(message["content"])
            else:
                transcript.append(message)
        transcript.insert(0, {"role": "system", "content": "\n\n".join(instructions)})
        functions = gigachat_functions(tools)
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        started = time.perf_counter()

        for _ in range(max_steps):
            payload = {
                "model": self._model,
                "messages": transcript,
                "functions": functions,
                "function_call": "auto",
                "max_tokens": self._max_tokens,
                "temperature": 0.2,
            }
            data = await self._api.request_json(
                "POST",
                "/v1/chat/completions",
                json=payload,
                timeout_s=self._timeout_s,
            )
            choices = data.get("choices")
            if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
                raise GigaChatAPIError(502, "GigaChat returned no completion choices")
            choice = choices[0]
            message = choice.get("message") or {}
            if not isinstance(message, dict):
                raise GigaChatAPIError(502, "GigaChat returned an invalid assistant message")

            usage_info = data.get("usage") or {}
            function_call = message.get("function_call")
            if usage_info and self.on_usage:
                self.on_usage("tool_selection" if function_call else "answer", usage_info)
            usage["prompt_tokens"] += int(usage_info.get("prompt_tokens", 0) or 0)
            usage["completion_tokens"] += int(usage_info.get("completion_tokens", 0) or 0)
            usage["total_tokens"] += int(usage_info.get("total_tokens", 0) or 0)

            if function_call:
                if not isinstance(function_call, dict):
                    raise GigaChatAPIError(502, "GigaChat returned an invalid function call")
                name = function_call.get("name")
                if not isinstance(name, str) or not name:
                    raise GigaChatAPIError(502, "GigaChat function call has no name")
                raw_arguments = function_call.get("arguments", {})
                if isinstance(raw_arguments, str):
                    try:
                        arguments = json.loads(raw_arguments)
                    except json.JSONDecodeError as exc:
                        raise GigaChatAPIError(502, "GigaChat returned invalid function arguments") from exc
                else:
                    arguments = raw_arguments
                if not isinstance(arguments, dict):
                    raise GigaChatAPIError(502, "GigaChat returned invalid function arguments")

                assistant_message: dict[str, Any] = {
                    "role": "assistant",
                    "content": message.get("content") or "",
                    "function_call": {"name": name, "arguments": arguments},
                }
                for state_key in ("functions_state_id", "function_state_id"):
                    if message.get(state_key):
                        assistant_message[state_key] = message[state_key]
                        break
                transcript.append(assistant_message)

                result = await execute_tool(name, arguments)
                tool_trace.append({"tool": name, "arguments": arguments, "result": result})
                transcript.append(
                    {
                        "role": "function",
                        "name": name,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
                continue

            if choice.get("finish_reason") == "error":
                raise GigaChatAPIError(502, "GigaChat could not generate valid function arguments")

            content = message.get("content") or ""
            if not isinstance(content, str):
                raise GigaChatAPIError(502, "GigaChat returned a non-text assistant response")
            usage["latency_ms"] = int((time.perf_counter() - started) * 1000)
            return content.strip(), tool_trace, usage

        usage["latency_ms"] = int((time.perf_counter() - started) * 1000)
        return "", tool_trace, usage
