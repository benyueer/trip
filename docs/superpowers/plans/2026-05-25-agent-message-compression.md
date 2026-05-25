# Agent Message & Tool Result Compression Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce token consumption and prevent context window overflow by (1) compressing old conversation history into LLM-generated summaries and (2) truncating large tool results before they enter the agent context.

**Architecture:** A new `compressor.py` module provides two independent capabilities: `compress_history()` summarizes old messages via a cheap LLM call, and `compress_tool_result()` truncates/extracts key data from large tool outputs. Both are invoked at the handler level before messages are passed to the LangGraph agent.

**Tech Stack:** Python, LangChain OpenAI, SQLAlchemy async, existing MessageManager/AgentMessage models

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend-py/app/agent/compressor.py` | History summarization + tool result compression logic |
| Modify | `backend-py/app/agent/message_manager.py:49-58` | Add `save_summary()` method to persist summary messages |
| Modify | `backend-py/app/agent/handlers/place_search.py:35-53` | Compress history before building agent, compress tool results on `on_tool_end` |
| Modify | `backend-py/app/agent/handlers/trip_planner.py:34-52` | Same compression integration |
| Modify | `backend-py/app/agent/handlers/memory.py:33-44` | Same compression integration |
| Modify | `backend-py/app/config.py:6-22` | Add compression threshold settings |

---

### Task 1: Add compression settings to config

**Files:**
- Modify: `backend-py/app/config.py:6-22`

- [ ] **Step 1: Add compression config fields**

Add these fields to the `Settings` class in `backend-py/app/config.py`:

```python
    # Agent compression settings
    agent_history_threshold: int = 15        # Trigger compression when history exceeds this many messages
    agent_history_keep_recent: int = 4       # Keep this many recent messages uncompressed
    agent_tool_result_max_chars: int = 2000  # Max characters for tool results before truncation
    agent_compress_model: str = ""           # Model for summarization (defaults to llm_model if empty)
```

- [ ] **Step 2: Verify config loads**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.config import settings; print(settings.agent_history_threshold, settings.agent_tool_result_max_chars)"`
Expected: `15 2000`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/config.py
git commit -m "feat(agent): add compression config settings"
```

---

### Task 2: Create compressor module

**Files:**
- Create: `backend-py/app/agent/compressor.py`

- [ ] **Step 1: Write the compressor module**

Create `backend-py/app/agent/compressor.py` with the following content:

```python
"""Message history summarization and tool result compression."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
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
```

- [ ] **Step 2: Verify import works**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.compressor import compress_history, compress_tool_result; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/compressor.py
git commit -m "feat(agent): add compressor module for history and tool results"
```

---

### Task 3: Add save_summary to MessageManager

**Files:**
- Modify: `backend-py/app/agent/message_manager.py:49-58`

- [ ] **Step 1: Add save_summary method**

Add the following method to the `MessageManager` class, after the `touch_session` method (after line 63):

```python
    async def save_summary(
        self,
        session_id: str,
        summary_content: str,
        summarized_count: int,
    ) -> AgentMessage:
        """Save a compressed history summary as a system message."""
        meta = json.dumps(
            {"type": "summary", "summarizedCount": summarized_count},
            ensure_ascii=False,
        )
        msg = AgentMessage(
            sessionId=session_id,
            role="system",
            content=summary_content,
            meta=meta,
        )
        self.db.add(msg)
        await self.db.flush()
        return msg
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.message_manager import MessageManager; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/message_manager.py
git commit -m "feat(agent): add save_summary method to MessageManager"
```

---

### Task 4: Integrate compression into place_search handler

**Files:**
- Modify: `backend-py/app/agent/handlers/place_search.py`

- [ ] **Step 1: Add import**

At the top of `backend-py/app/agent/handlers/place_search.py`, add after the existing imports (after line 16):

```python
from app.agent.compressor import compress_history, compress_tool_result
```

- [ ] **Step 2: Compress history before building agent**

Replace lines 34-53 (the `# Load history and build prompt` section through `langchain_messages = _history_to_langchain(history)`) with:

```python
    # Load history, compress if needed, and build prompt
    history = await message_manager.load_history(session_id)
    if len(history) > settings.agent_history_threshold:
        old_count = len(history) - settings.agent_history_keep_recent
        history = await compress_history(history)
        # Persist the summary
        for msg in history:
            if msg.id == "summary":
                await message_manager.save_summary(session_id, msg.content, old_count)
    system_prompt = await prompt_builder.build(user_id, intent="place_search", current_trip_id=current_trip_id)

    # Get filtered tools for this intent
    tools = tool_registry.get_tools_for_intent("place_search")
    tool_node = ToolNode(tools, handle_tool_errors=True)

    # Build LLM and agent
    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.7,
        streaming=True,
    )
    agent = create_react_agent(model=llm, tools=tool_node, prompt=system_prompt, name="place_search")

    # Convert history and stream
    langchain_messages = _history_to_langchain(history)
```

Also add `from app.config import settings` if not already imported (it is already imported, so no action needed).

- [ ] **Step 3: Compress tool results in on_tool_end**

In the `on_tool_end` event handler (around line 83-95), replace the output processing with compressed output:

Replace:
```python
            elif kind == "on_tool_end":
                output = event.get("data", {}).get("output", "")
                tool_name = event.get("name", "unknown")
                tool_call_id = event.get("run_id", "")
                if output is not None:
                    tool_results_buffer.append(output)
                    output_str = _stringify_output(output)
                    yield json.dumps({
                        "type": "tool_end",
                        "tool": tool_name,
                        "toolCallId": tool_call_id,
                        "output": output_str,
                    }, ensure_ascii=False) + "\n"
```

With:
```python
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
```

- [ ] **Step 4: Verify no import/syntax errors**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.handlers.place_search import handle_place_search; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend-py/app/agent/handlers/place_search.py
git commit -m "feat(agent): integrate history and tool result compression in place_search"
```

---

### Task 5: Integrate compression into trip_planner handler

**Files:**
- Modify: `backend-py/app/agent/handlers/trip_planner.py`

- [ ] **Step 1: Add import**

At the top of `backend-py/app/agent/handlers/trip_planner.py`, add after the existing imports (after line 15):

```python
from app.agent.compressor import compress_history, compress_tool_result
```

- [ ] **Step 2: Compress history before building agent**

Replace lines 33-52 (the `# Load history and build prompt` section through `langchain_messages = _history_to_langchain(history)`) with:

```python
    # Load history, compress if needed, and build prompt
    history = await message_manager.load_history(session_id)
    if len(history) > settings.agent_history_threshold:
        old_count = len(history) - settings.agent_history_keep_recent
        history = await compress_history(history)
        for msg in history:
            if msg.id == "summary":
                await message_manager.save_summary(session_id, msg.content, old_count)
    system_prompt = await prompt_builder.build(user_id, intent="trip_planner", current_trip_id=current_trip_id)

    # Get filtered tools for this intent
    tools = tool_registry.get_tools_for_intent("trip_planner")
    tool_node = ToolNode(tools, handle_tool_errors=True)

    # Build LLM and agent
    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.7,
        streaming=True,
    )
    agent = create_react_agent(model=llm, tools=tool_node, prompt=system_prompt, name="trip_planner")

    # Convert history and stream
    langchain_messages = _history_to_langchain(history)
```

- [ ] **Step 3: Compress tool results in on_tool_end**

In the `on_tool_end` event handler (around line 82-94), replace `_stringify_output(output)` with `compress_tool_result(output)`:

Replace:
```python
                    output_str = _stringify_output(output)
```

With:
```python
                    output_str = compress_tool_result(output)
```

- [ ] **Step 4: Verify no import/syntax errors**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.handlers.trip_planner import handle_trip_planner; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend-py/app/agent/handlers/trip_planner.py
git commit -m "feat(agent): integrate history and tool result compression in trip_planner"
```

---

### Task 6: Integrate compression into memory handler

**Files:**
- Modify: `backend-py/app/agent/handlers/memory.py`

- [ ] **Step 1: Add import**

At the top of `backend-py/app/agent/handlers/memory.py`, add after the existing imports (after line 15):

```python
from app.agent.compressor import compress_history, compress_tool_result
```

- [ ] **Step 2: Compress history before building agent**

Replace lines 33-44 (from `history = await message_manager.load_history(session_id)` through `langchain_messages = _history_to_langchain(history)`) with:

```python
    history = await message_manager.load_history(session_id)
    if len(history) > settings.agent_history_threshold:
        old_count = len(history) - settings.agent_history_keep_recent
        history = await compress_history(history)
        for msg in history:
            if msg.id == "summary":
                await message_manager.save_summary(session_id, msg.content, old_count)
    system_prompt = await prompt_builder.build(user_id, intent="memory")

    tools = tool_registry.get_tools_for_intent("memory")
    tool_node = ToolNode(tools, handle_tool_errors=True)

    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.7,
        streaming=True,
    )
    agent = create_react_agent(model=llm, tools=tool_node, prompt=system_prompt, name="memory_handler")

    langchain_messages = _history_to_langchain(history)
```

- [ ] **Step 3: Compress tool results in on_tool_end**

In the `on_tool_end` event handler, replace `_stringify_output(output)` with `compress_tool_result(output)`:

Replace:
```python
                    output_str = _stringify_output(output)
```

With:
```python
                    output_str = compress_tool_result(output)
```

- [ ] **Step 4: Verify no import/syntax errors**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.handlers.memory import handle_memory; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend-py/app/agent/handlers/memory.py
git commit -m "feat(agent): integrate history and tool result compression in memory handler"
```

---

### Task 7: Update _history_to_langchain to handle system messages

**Files:**
- Modify: `backend-py/app/agent/handlers/place_search.py:116-123`

- [ ] **Step 1: Update _history_to_langchain**

The current `_history_to_langchain` only handles `user` and `assistant` roles. After compression, we now have `system` role messages (summaries). Update the function:

Replace:
```python
def _history_to_langchain(history: list[AgentMessage]) -> list:
    msgs = []
    for msg in history:
        if msg.role == "user":
            msgs.append(HumanMessage(content=msg.content or " "))
        elif msg.role == "assistant":
            msgs.append(AIMessage(content=msg.content or " "))
    return msgs
```

With:
```python
def _history_to_langchain(history: list[AgentMessage]) -> list:
    from langchain_core.messages import SystemMessage
    msgs = []
    for msg in history:
        if msg.role == "user":
            msgs.append(HumanMessage(content=msg.content or " "))
        elif msg.role == "assistant":
            msgs.append(AIMessage(content=msg.content or " "))
        elif msg.role == "system":
            msgs.append(SystemMessage(content=msg.content or " "))
    return msgs
```

- [ ] **Step 2: Verify**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.handlers.place_search import _history_to_langchain; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/handlers/place_search.py
git commit -m "feat(agent): handle system messages in _history_to_langchain"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Verify all modules import cleanly**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "
from app.config import settings
from app.agent.compressor import compress_history, compress_tool_result
from app.agent.message_manager import MessageManager
from app.agent.handlers.place_search import handle_place_search
from app.agent.handlers.trip_planner import handle_trip_planner
from app.agent.handlers.memory import handle_memory
print('All imports OK')
print(f'Threshold: {settings.agent_history_threshold}')
print(f'Keep recent: {settings.agent_history_keep_recent}')
print(f'Tool result max: {settings.agent_tool_result_max_chars}')
"`
Expected: `All imports OK` followed by config values

- [ ] **Step 2: Test compress_tool_result locally**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "
import json
from app.agent.compressor import compress_tool_result

# Test short result (no compression)
short = json.dumps({'name': '西湖', 'address': '杭州市'})
assert compress_tool_result(short) == short

# Test long result (should compress)
long_data = {'results': [{'name': f'place_{i}', 'lngLat': [120+i, 30+i], 'address': f'address_{i}' * 20} for i in range(20)]}
long_str = json.dumps(long_data, ensure_ascii=False)
result = compress_tool_result(long_str)
assert len(result) < len(long_str)
print(f'Compressed {len(long_str)} -> {len(result)} chars')
print('compress_tool_result OK')
"`
Expected: Shows compression ratio and `compress_tool_result OK`

- [ ] **Step 3: Commit any fixes if needed**

If any issues were found and fixed:
```bash
git add -A
git commit -m "fix(agent): address compression integration issues"
```
