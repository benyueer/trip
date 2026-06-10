# Unified Agent Handler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three duplicate agent handlers (place_search, trip_planner, memory) into a single unified handler where intent only affects prompt, tools, and metadata extraction — not code paths.

**Architecture:** One `handle_agent` function replaces all three handlers. Intent determines: (1) which prompt is used, (2) which tools are available, (3) how tool results are extracted into metadata. The streaming loop, error handling, and message persistence are written once.

**Tech Stack:** Python, LangChain, LangGraph, SQLAlchemy async

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend-py/app/agent/handlers/base.py` | `_history_to_langchain`, `_stringify_output` (moved from place_search) |
| Create | `backend-py/app/agent/handlers/extractors.py` | Metadata extraction functions per intent |
| Create | `backend-py/app/agent/handlers/agent.py` | Single `handle_agent` function |
| Modify | `backend-py/app/agent/engine.py` | Replace 3-handler dispatch with single `handle_agent` call |
| Modify | `backend-py/app/agent/tools.py` | Remove `_intent_tags` monkey-patching, use `extractors.py` registry |
| Delete | `backend-py/app/agent/handlers/place_search.py` | Replaced by `agent.py` |
| Delete | `backend-py/app/agent/handlers/trip_planner.py` | Replaced by `agent.py` |
| Delete | `backend-py/app/agent/handlers/memory.py` | Replaced by `agent.py` |
| Modify | `backend-py/app/agent/handlers/__init__.py` | Update exports |

---

### Task 1: Create shared utilities module `handlers/base.py`

**Files:**
- Create: `backend-py/app/agent/handlers/base.py`

- [ ] **Step 1: Create `base.py` with shared utilities**

```python
"""Shared utilities for agent handlers."""
from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.models import AgentMessage


def history_to_langchain(history: list[AgentMessage]) -> list:
    """Convert AgentMessage list to LangChain message format."""
    msgs = []
    for msg in history:
        if msg.role == "user":
            msgs.append(HumanMessage(content=msg.content or " "))
        elif msg.role == "assistant":
            msgs.append(AIMessage(content=msg.content or " "))
        elif msg.role == "system":
            msgs.append(SystemMessage(content=msg.content or " "))
    return msgs


def stringify_output(output: Any) -> str:
    """Convert tool output to string for display."""
    if isinstance(output, str):
        return output
    if hasattr(output, "content"):
        return str(output.content)
    if isinstance(output, dict):
        return json.dumps(output, ensure_ascii=False)
    return str(output)
```

- [ ] **Step 2: Verify import works**

Run: `cd backend-py && source .venv/bin/activate && python -c "from app.agent.handlers.base import history_to_langchain, stringify_output; print('ok')"`
Expected: `ok`

---

### Task 2: Create metadata extractors module `handlers/extractors.py`

**Files:**
- Create: `backend-py/app/agent/handlers/extractors.py`

- [ ] **Step 1: Create `extractors.py` with all extraction functions**

```python
"""Metadata extractors keyed by intent.

Each extractor takes a list of tool outputs and returns a metadata dict.
The unified handler calls the appropriate extractor based on intent.
"""
from __future__ import annotations

import json
from typing import Any

from app.logger import logger


def _parse_tool_output(result: Any) -> dict | None:
    """Try to parse a tool output into a dict."""
    try:
        if isinstance(result, str):
            return json.loads(result)
        if isinstance(result, dict):
            return result
        if hasattr(result, "content"):
            content = result.content
            return json.loads(content) if isinstance(content, str) else content
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def extract_places_metadata(tool_results: list[Any]) -> dict:
    """Extract place data from tool results (for place_search intent).

    Scans all tool outputs for structured place data (with lngLat).
    Prefers structured data; falls back to webSearch results.
    """
    structured: list[dict] = []
    fallback: list[dict] = []

    for result in tool_results:
        data = _parse_tool_output(result)
        if not data or not isinstance(data, dict):
            continue

        for key in ("suggested_places", "places", "results", "pois"):
            val = data.get(key)
            if not isinstance(val, list) or not val:
                continue
            for item in val:
                if not isinstance(item, dict):
                    continue
                name = item.get("name") or item.get("title") or item.get("pname")
                if not name:
                    continue
                lnglat = item.get("lngLat") or item.get("location") or []
                if isinstance(lnglat, str) and "," in lnglat:
                    try:
                        parts = lnglat.split(",")
                        lnglat = [float(parts[0]), float(parts[1])]
                    except (ValueError, IndexError):
                        lnglat = []
                if isinstance(lnglat, list) and len(lnglat) >= 2 and lnglat[0] and lnglat[1]:
                    structured.append({
                        "name": name,
                        "lngLat": lnglat[:2],
                        "description": item.get("description") or item.get("snippet", ""),
                        "category": item.get("category") or item.get("type", ""),
                        "address": item.get("address") or item.get("addr", ""),
                        "rating": item.get("rating", ""),
                        "ticket": item.get("ticket", ""),
                        "openingHours": item.get("openingHours") or item.get("business_hours", ""),
                    })
                else:
                    fallback.append({
                        "name": name,
                        "lngLat": [],
                        "description": item.get("description") or item.get("snippet", ""),
                        "address": item.get("address") or item.get("url", ""),
                    })

    all_places = structured if structured else fallback
    metadata: dict = {}
    if all_places:
        seen: set[str] = set()
        unique: list[dict] = []
        for p in all_places:
            key = str(p.get("name", ""))
            if key and key not in seen:
                seen.add(key)
                unique.append(p)
        metadata["suggestedPlaces"] = unique
    return metadata


def extract_trip_metadata(tool_results: list[Any]) -> dict:
    """Extract trip plan metadata from tool results (for trip_planner intent)."""
    metadata: dict = {}
    for result in tool_results:
        data = _parse_tool_output(result)
        if not data or not isinstance(data, dict):
            continue

        if data.get("tripId") and "title" in data:
            metadata.setdefault("tripId", data["tripId"])
            metadata.setdefault("tripTitle", data["title"])

        if data.get("remainingPlaces") is not None:
            metadata["modifiedTripId"] = data.get("tripId")

        if data.get("plan"):
            metadata["dayPlan"] = data["plan"]

        if data.get("suggested_places"):
            metadata["suggestedPlaces"] = data["suggested_places"]

    return metadata


def extract_memory_metadata(tool_results: list[Any]) -> dict:
    """Extract memory metadata (for memory intent). No structured extraction needed."""
    return {}


# Intent → extractor mapping
EXTRACTORS = {
    "place_search": extract_places_metadata,
    "trip_planner": extract_trip_metadata,
    "memory": extract_memory_metadata,
}


# Intent → recursion limit
RECURSION_LIMITS = {
    "place_search": 30,
    "trip_planner": 50,
    "memory": 10,
}

DEFAULT_RECURSION_LIMIT = 30
```

- [ ] **Step 2: Verify import works**

Run: `cd backend-py && source .venv/bin/activate && python -c "from app.agent.handlers.extractors import EXTRACTORS, RECURSION_LIMITS; print('ok')"`
Expected: `ok`

---

### Task 3: Create unified handler `handlers/agent.py`

**Files:**
- Create: `backend-py/app/agent/handlers/agent.py`

- [ ] **Step 1: Create the unified handler**

```python
"""Unified agent handler — one entry point for all intents."""
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.tool_node import ToolNode

from app.agent.compressor import compress_tool_result
from app.agent.handlers.base import history_to_langchain
from app.agent.handlers.extractors import (
    DEFAULT_RECURSION_LIMIT,
    EXTRACTORS,
    RECURSION_LIMITS,
)
from app.agent.message_manager import MessageManager
from app.agent.prompt_builder import PromptBuilder
from app.agent.tool_registry import ToolRegistry
from app.config import settings
from app.logger import logger


async def handle_agent(
    *,
    user_id: str,
    session_id: str,
    user_message: str,
    intent: str,
    current_trip_id: str | None,
    message_manager: MessageManager,
    prompt_builder: PromptBuilder,
    tool_registry: ToolRegistry,
) -> AsyncIterator[str]:
    """Single agent handler for all intents.

    Intent determines: prompt, tools, recursion limit, metadata extraction.
    """
    # Save user message
    await message_manager.save_message(session_id, "user", user_message)

    # Load history (auto-compressed if too long) and build prompt
    history = await message_manager.load_compressed_history(session_id)
    system_prompt = await prompt_builder.build(
        user_id, intent=intent, current_trip_id=current_trip_id
    )

    # Get tools filtered by intent
    tools = tool_registry.get_tools_for_intent(intent)
    tool_node = ToolNode(tools, handle_tool_errors=True)

    # Build LLM and agent
    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.7,
        streaming=True,
    )
    recursion_limit = RECURSION_LIMITS.get(intent, DEFAULT_RECURSION_LIMIT)
    agent = create_react_agent(
        model=llm, tools=tool_node, prompt=system_prompt, name=intent
    )

    # Convert history and stream
    langchain_messages = history_to_langchain(history)
    token_buffer: list[str] = []
    tool_results_buffer: list[Any] = []

    try:
        async for event in agent.astream_events(
            {"messages": langchain_messages},
            version="v2",
            config={"recursion_limit": recursion_limit},
        ):
            try:
                kind = event["event"]

                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    if chunk.content:
                        token_buffer.append(chunk.content)
                        yield json.dumps(
                            {"type": "token", "content": chunk.content},
                            ensure_ascii=False,
                        ) + "\n"

                elif kind == "on_tool_start":
                    tool_name = event.get("name", "unknown")
                    tool_input = event.get("data", {}).get("input", {})
                    tool_call_id = event.get("run_id", "")
                    logger.agent.tool_call(tool_name, tool_input)
                    yield json.dumps({
                        "type": "tool_start",
                        "tool": tool_name,
                        "input": tool_input,
                        "toolCallId": tool_call_id,
                    }, ensure_ascii=False) + "\n"

                elif kind == "on_tool_end":
                    output = event.get("data", {}).get("output", "")
                    tool_name = event.get("name", "unknown")
                    tool_call_id = event.get("run_id", "")
                    if output is not None:
                        tool_results_buffer.append(output)
                        output_str = compress_tool_result(output)
                        yield json.dumps({
                            "type": "tool_end",
                            "tool": tool_name,
                            "toolCallId": tool_call_id,
                            "output": output_str,
                        }, ensure_ascii=False) + "\n"
            except Exception as event_err:
                logger.error("agent", f"Event processing error in {intent}: {event_err}")
                yield json.dumps(
                    {"type": "token", "content": f"\n\n[工具调用异常: {event_err}]\n"},
                    ensure_ascii=False,
                ) + "\n"
                continue
    except Exception as e:
        logger.error("agent", f"Stream error in {intent}: {e}")
        error_msg = "\n\n抱歉，处理过程中出现错误，请重试。"
        yield json.dumps(
            {"type": "token", "content": error_msg}, ensure_ascii=False
        ) + "\n"
        await message_manager.save_message(
            session_id, "assistant", error_msg, meta={"intent": intent, "error": True}
        )
        return

    # Extract metadata using intent-specific extractor
    final_text = "".join(token_buffer) or "已为您处理完毕。"
    extractor = EXTRACTORS.get(intent, lambda _: {})
    metadata = extractor(tool_results_buffer)
    metadata["intent"] = intent

    # Save assistant message
    await message_manager.save_message(session_id, "assistant", final_text, meta=metadata)
    sess = await message_manager.get_or_create_session(session_id, user_id)
    await message_manager.touch_session(sess)

    # Yield metadata event
    yield json.dumps({"type": "meta", "data": metadata}, ensure_ascii=False) + "\n"
```

- [ ] **Step 2: Verify import works**

Run: `cd backend-py && source .venv/bin/activate && python -c "from app.agent.handlers.agent import handle_agent; print('ok')"`
Expected: `ok`

---

### Task 4: Update `engine.py` to use unified handler

**Files:**
- Modify: `backend-py/app/agent/engine.py`

- [ ] **Step 1: Rewrite `engine.py`**

Replace entire file with:

```python
from __future__ import annotations

import json
from typing import AsyncIterator, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.handlers.agent import handle_agent
from app.agent.message_manager import MessageManager
from app.agent.prompt_builder import PromptBuilder
from app.agent.tool_registry import ToolRegistry
from app.agent.tools import create_local_tools
from app.db.database import async_session_factory
from app.logger import logger

# Default intent when none is specified
_DEFAULT_INTENT = "trip_planner"


def _build_tool_registry(db_session: AsyncSession, user_id: str) -> ToolRegistry:
    """Build a ToolRegistry with local and MCP tools."""
    registry = ToolRegistry()
    local_tools = create_local_tools(db_session, user_id)
    registry.register_local_tools(local_tools)
    registry.load_mcp_tools()
    return registry


async def stream_chat_with_agent(
    user_id: str,
    session_id: str,
    user_message: str,
    current_trip_id: Optional[str] = None,
    intent: Optional[str] = None,
) -> AsyncIterator[str]:
    """Stream agent response for any intent via the unified handler."""
    resolved_intent = intent or _DEFAULT_INTENT

    async with async_session_factory() as db_session:
        message_manager = MessageManager(db_session)
        prompt_builder = PromptBuilder(db_session)
        tool_registry = _build_tool_registry(db_session, user_id)

        await message_manager.get_or_create_session(session_id, user_id)

        logger.info("agent", f"Handling intent '{resolved_intent}' for session {session_id[:8]}")

        text_length = 0
        try:
            async for chunk in handle_agent(
                user_id=user_id,
                session_id=session_id,
                user_message=user_message,
                intent=resolved_intent,
                current_trip_id=current_trip_id,
                message_manager=message_manager,
                prompt_builder=prompt_builder,
                tool_registry=tool_registry,
            ):
                text_length += len(chunk)
                yield chunk
            await db_session.commit()
        except Exception as e:
            await db_session.rollback()
            logger.error("agent", f"Handler error for intent '{resolved_intent}': {e}")
            yield json.dumps(
                {"type": "token", "content": "\n\n抱歉，处理过程中出现错误，请重试。"},
                ensure_ascii=False,
            ) + "\n"
        finally:
            logger.agent.stream_end(session_id, text_length)
```

- [ ] **Step 2: Verify import works**

Run: `cd backend-py && source .venv/bin/activate && python -c "from app.agent.engine import stream_chat_with_agent; print('ok')"`
Expected: `ok`

---

### Task 5: Update `handlers/__init__.py` and delete old handlers

**Files:**
- Modify: `backend-py/app/agent/handlers/__init__.py`
- Delete: `backend-py/app/agent/handlers/place_search.py`
- Delete: `backend-py/app/agent/handlers/trip_planner.py`
- Delete: `backend-py/app/agent/handlers/memory.py`

- [ ] **Step 1: Update `__init__.py`**

```python
"""Agent handlers."""
from app.agent.handlers.agent import handle_agent

__all__ = ["handle_agent"]
```

- [ ] **Step 2: Delete old handler files**

```bash
rm backend-py/app/agent/handlers/place_search.py
rm backend-py/app/agent/handlers/trip_planner.py
rm backend-py/app/agent/handlers/memory.py
```

- [ ] **Step 3: Verify no broken imports**

Run: `cd backend-py && source .venv/bin/activate && python -c "from app.agent.engine import stream_chat_with_agent; from app.agent.handlers import handle_agent; print('ok')"`
Expected: `ok`

---

### Task 6: Verify full import chain and startup

**Files:**
- None (verification only)

- [ ] **Step 1: Verify the full app can import**

Run: `cd backend-py && source .venv/bin/activate && python -c "from app.main import create_app; print('ok')"`
Expected: `ok`

- [ ] **Step 2: Run any existing tests**

Run: `cd backend-py && source .venv/bin/activate && python -m pytest tests/ -v --tb=short 2>&1 | tail -20`
Expected: Tests pass (or no tests found)

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/handlers/ backend-py/app/agent/engine.py
git commit -m "refactor(agent): unify three handlers into single handle_agent

Collapse place_search, trip_planner, memory handlers into one
handle_agent function. Intent now only determines prompt, tools,
recursion limit, and metadata extraction — not code paths.

- Create handlers/base.py: shared history_to_langchain, stringify_output
- Create handlers/extractors.py: per-intent metadata extractors + config
- Create handlers/agent.py: single unified handler
- Simplify engine.py: remove handler dispatch dict
- Delete place_search.py, trip_planner.py, memory.py"
```

---

## Summary

| Before | After |
|--------|-------|
| 3 handler files (~150 lines each, 90% duplicate) | 1 `agent.py` (~110 lines) |
| `_history_to_langchain` in place_search.py, imported by others | `history_to_langchain` in `base.py` |
| `_extract_places_metadata` in place_search.py | `extractors.py` with all extractors |
| `_extract_trip_metadata` in trip_planner.py | `extractors.py` with all extractors |
| `_HANDLERS` dispatch dict in engine.py | Direct call to `handle_agent` |
| Intent-specific `recursion_limit` hardcoded in each handler | `RECURSION_LIMITS` dict in `extractors.py` |
| `if intent == "memory": kwargs.pop(...)` special case | No special cases — `current_trip_id=None` is always passed |

The intent classification system (`intent.py`, `_map_intent` in `routes.py`) is unchanged — it still determines which prompt, tools, and extractor are used. The difference is that intent no longer determines which *function* runs.
