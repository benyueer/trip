"""Message history summarization and tool result compression."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

from app.config import settings
from app.logger import logger
from app.models import AgentMessage


async def compress_history(
    history: list[AgentMessage],
) -> list[AgentMessage]:
    """Compress old messages into a summary, keeping recent messages intact.

    If history length <= threshold, returns history unchanged.
    Otherwise, summarizes the older messages via LLM and returns:
    [summary_message] + recent messages
    """
    threshold = settings.agent_history_threshold
    keep_recent = settings.agent_history_keep_recent

    if len(history) <= threshold:
        return history

    old_messages = history[: len(history) - keep_recent]
    recent_messages = history[len(history) - keep_recent :]

    summary_text = await _summarize_messages(old_messages)
    logger.info("agent", f"Compressed {len(old_messages)} messages into summary",
                {"old_count": len(old_messages), "summary_len": len(summary_text)})

    summary_msg = AgentMessage(
        id="summary",
        sessionId=old_messages[0].sessionId if old_messages else "",
        role="system",
        content=f"[以下是之前对话的摘要]\n{summary_text}",
    )

    return [summary_msg] + recent_messages


def compress_tool_result(output: Any, max_chars: int | None = None) -> str:
    """Compress a tool result to fit within max_chars.

    Strategy:
    1. Stringify the output
    2. If within limit, return as-is
    3. For JSON: extract key fields, truncate arrays
    4. Fallback: hard truncate with ellipsis
    """
    limit = max_chars or settings.agent_tool_result_max_chars

    if isinstance(output, str):
        text = output
    elif hasattr(output, "content"):
        text = str(output.content)
    elif isinstance(output, dict):
        text = json.dumps(output, ensure_ascii=False)
    else:
        text = str(output)

    if len(text) <= limit:
        return text

    # Try JSON-aware compression
    try:
        data = json.loads(text) if isinstance(text, str) else output
        if isinstance(data, dict):
            return _compress_json_dict(data, limit)
        if isinstance(data, list):
            return _compress_json_list(data, limit)
    except (json.JSONDecodeError, TypeError):
        pass

    # Fallback: hard truncate
    return text[:limit] + f"\n...[truncated, total {len(text)} chars]"


async def _summarize_messages(messages: list[AgentMessage]) -> str:
    """Use LLM to summarize a list of messages into a concise summary."""
    model = settings.agent_compress_model or settings.llm_model

    llm = ChatOpenAI(
        model=model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.3,
        streaming=False,
    )

    conversation_text = ""
    for msg in messages:
        role = "用户" if msg.role == "user" else "助手" if msg.role == "assistant" else "系统"
        content = msg.content or ""
        # Truncate very long individual messages to avoid blowing up the summarization prompt
        if len(content) > 1000:
            content = content[:1000] + "...[截断]"
        conversation_text += f"[{role}]: {content}\n"

    prompt = f"""请将以下对话历史压缩为简洁的摘要，保留关键信息（用户需求、已确认的方案、重要决策、地点信息等）。
摘要应该让后续对话能够理解上下文，但不需要保留每一句话的细节。

对话历史：
{conversation_text}

请用中文输出摘要，不超过500字。"""

    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        return response.content
    except Exception as e:
        logger.error("agent", f"History summarization failed: {e}")
        # Fallback: return truncated raw messages
        fallback = ""
        for msg in messages[-3:]:
            role = "用户" if msg.role == "user" else "助手"
            content = (msg.content or "")[:200]
            fallback += f"[{role}]: {content}\n"
        return fallback


def _compress_json_dict(data: dict, limit: int) -> str:
    """Compress a JSON dict by keeping essential keys and truncating large values."""
    # Keys to prioritize keeping
    essential_keys = {
        "name", "lngLat", "address", "category", "rating", "description",
        "ticket", "address", "phone", "openingHours", "suggested_places",
        "tripId", "title", "dayIndex", "status", "error", "message",
    }

    compressed = {}
    for key, value in data.items():
        if key in essential_keys:
            compressed[key] = value
        elif isinstance(value, str) and len(value) > 200:
            compressed[key] = value[:200] + "..."
        elif isinstance(value, list) and len(value) > 5:
            compressed[key] = value[:5] + [f"...共{len(value)}项"]
        elif isinstance(value, (int, float, bool, type(None))):
            compressed[key] = value

    result = json.dumps(compressed, ensure_ascii=False)
    if len(result) <= limit:
        return result

    # Still too large, aggressive truncation
    for key in list(compressed.keys()):
        if key not in essential_keys:
            del compressed[key]
            result = json.dumps(compressed, ensure_ascii=False)
            if len(result) <= limit:
                return result

    return result[:limit] + f"\n...[truncated, total {len(json.dumps(data, ensure_ascii=False))} chars]"


def _compress_json_list(data: list, limit: int) -> str:
    """Compress a JSON list by keeping first N items."""
    if not data:
        return "[]"

    # Try keeping progressively fewer items
    for keep in [5, 3, 1]:
        truncated = data[:keep] + [f"...共{len(data)}项"]
        result = json.dumps(truncated, ensure_ascii=False)
        if len(result) <= limit:
            return result

    return json.dumps(data[0], ensure_ascii=False)[:limit] + f"\n...[list of {len(data)} items, truncated]"
