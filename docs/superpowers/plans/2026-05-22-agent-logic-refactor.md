# Agent Logic Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the agent backend into modular components (MessageManager, ToolRegistry, PromptBuilder, Intent Handlers) with clear separation of concerns, and optimize the two core scenarios (place search, trip planning) with intent-specific prompts and tool filtering.

**Architecture:** Extract responsibilities from the monolithic `stream_chat_with_agent` into focused modules: `MessageManager` for session/message persistence, `ToolRegistry` for tool registration and intent-based filtering, `PromptBuilder` for dynamic system prompts with scenario-specific guidance, and intent handlers (`place_search`, `trip_planner`, `memory`) that orchestrate tool calls per scenario. The engine becomes a thin coordinator that delegates to these components.

**Tech Stack:** Python, Litestar, SQLAlchemy (async), LangChain, LangGraph, React, Zustand

---

## File Structure

### New files to create:
- `backend-py/app/agent/message_manager.py` — Session/message CRUD, history loading
- `backend-py/app/agent/tool_registry.py` — Tool registration, discovery, and intent-based filtering
- `backend-py/app/agent/prompt_builder.py` — Dynamic system prompt assembly with intent-specific templates
- `backend-py/app/agent/handlers/__init__.py` — Handler package
- `backend-py/app/agent/handlers/place_search.py` — Place search intent handler
- `backend-py/app/agent/handlers/trip_planner.py` — Trip planning intent handler
- `backend-py/app/agent/handlers/memory.py` — Memory/preference intent handler

### Files to modify:
- `backend-py/app/agent/engine.py` — Simplify to thin coordinator using new modules
- `backend-py/app/agent/tools.py` — Add `intent_tags` metadata to each tool for filtering
- `backend-py/app/agent/routes.py` — Pass intent to engine, use new modules
- `frontend/src/store/index.ts` — Handle `intent` field in metadata, add `agentIntent` state

---

### Task 1: MessageManager — Session and Message CRUD

**Files:**
- Create: `backend-py/app/agent/message_manager.py`

- [ ] **Step 1: Create MessageManager class**

```python
# backend-py/app/agent/message_manager.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentMessage, AgentSession


class MessageManager:
    """Handles session lifecycle and message persistence."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def get_or_create_session(
        self, session_id: str, user_id: str, title: str = "新对话"
    ) -> AgentSession:
        result = await self.db.execute(
            select(AgentSession).where(AgentSession.id == session_id)
        )
        sess = result.scalar_one_or_none()
        if not sess:
            sess = AgentSession(id=session_id, userId=user_id, title=title)
            self.db.add(sess)
            await self.db.flush()
        return sess

    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        meta: Optional[dict] = None,
    ) -> AgentMessage:
        msg = AgentMessage(
            sessionId=session_id,
            role=role,
            content=content,
            meta=json.dumps(meta, ensure_ascii=False) if meta else None,
        )
        self.db.add(msg)
        await self.db.flush()
        return msg

    async def load_history(
        self, session_id: str, limit: int = 20
    ) -> list[AgentMessage]:
        result = await self.db.execute(
            select(AgentMessage)
            .where(AgentMessage.sessionId == session_id)
            .order_by(AgentMessage.createdAt.asc())
        )
        all_messages = result.scalars().all()
        return all_messages[-limit:]

    async def touch_session(self, session: AgentSession) -> None:
        session.updatedAt = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.db.flush()
```

- [ ] **Step 2: Run lint check**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.message_manager import MessageManager; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/message_manager.py
git commit -m "feat(agent): add MessageManager for session/message CRUD"
```

---

### Task 2: ToolRegistry — Tool Registration and Intent Filtering

**Files:**
- Create: `backend-py/app/agent/tool_registry.py`
- Modify: `backend-py/app/agent/tools.py`

- [ ] **Step 1: Add intent_tags to tools in tools.py**

Modify `backend-py/app/agent/tools.py` to add `_intent_tags` attribute to each tool after creation. Replace the return statement at the end of `create_local_tools` (line 328-335):

```python
    tools_list = [
        web_search,
        query_local_places,
        save_user_memory_,
        create_trip_plan_,
        modify_trip_plan_,
        plan_day_route_,
    ]

    # Tag tools with the intents they serve
    web_search._intent_tags = ["place_search", "trip_planner"]
    query_local_places._intent_tags = ["place_search", "trip_planner"]
    save_user_memory_.intent_tags = ["memory"]
    create_trip_plan_.intent_tags = ["trip_planner"]
    modify_trip_plan_.intent_tags = ["trip_planner"]
    plan_day_route_.intent_tags = ["trip_planner"]

    return tools_list
```

- [ ] **Step 2: Create ToolRegistry class**

```python
# backend-py/app/agent/tool_registry.py
from __future__ import annotations

from typing import Optional

from langchain_core.tools import BaseTool

from app.clients.mcp_client import get_mcp_tools
from app.logger import logger


class ToolRegistry:
    """Manages tool registration, discovery, and intent-based filtering."""

    def __init__(self):
        self._local_tools: list[BaseTool] = []
        self._mcp_tools: list[BaseTool] = []

    def register_local_tools(self, tools: list[BaseTool]) -> None:
        self._local_tools = tools

    def load_mcp_tools(self) -> None:
        self._mcp_tools = get_mcp_tools()

    def get_tools_for_intent(self, intent: Optional[str] = None) -> list[BaseTool]:
        """Return tools filtered by intent. If intent is None, return all."""
        mcp = self._mcp_tools
        if intent is None:
            return self._local_tools + mcp

        filtered = [
            t for t in self._local_tools
            if hasattr(t, "_intent_tags") and intent in t._intent_tags
        ]
        # MCP tools are always available (geo, routing, etc.)
        return filtered + mcp

    def get_all_tools(self) -> list[BaseTool]:
        return self._local_tools + self._mcp_tools

    @property
    def tool_names(self) -> list[str]:
        return [t.name for t in self._local_tools + self._mcp_tools]
```

- [ ] **Step 3: Run lint check**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.tool_registry import ToolRegistry; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend-py/app/agent/tool_registry.py backend-py/app/agent/tools.py
git commit -m "feat(agent): add ToolRegistry with intent-based filtering"
```

---

### Task 3: PromptBuilder — Dynamic System Prompts

**Files:**
- Create: `backend-py/app/agent/prompt_builder.py`

- [ ] **Step 1: Create PromptBuilder with scenario-specific templates**

```python
# backend-py/app/agent/prompt_builder.py
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import AgentMessage, Day, Trip, UserMemory


BASE_PROMPT = """你是一个专业的旅行规划助手。你的职责是：
1. 帮助用户探索和查询旅行目的地
2. 根据用户偏好规划行程路线
3. 动态修改已有行程
4. 记住用户的旅行偏好

回复规则：
- 使用中文回复
- 每次回复必须包含文字说明，即使你调用了工具也要用文字向用户说明你做了什么、结果如何
- 回复要简洁、有用，适合旅行场景
- 如果用户的问题与旅行无关，礼貌地告知你只能帮助旅行规划相关的问题

地点字段规范（非常重要，必须严格遵守）：
每个地点对象必须且只能包含以下字段：
- name (string, 必填): 地点名称
- lngLat ([number, number], 必填): 经纬度坐标，格式为 [经度, 纬度]，如 [120.15, 30.25]
- description (string, 可选): 地点简介
- category (string, 可选): 分类，如"景点"、"餐厅"、"酒店"
- address (string, 可选): 详细地址
- rating (string, 可选): 评分，如 "4.5"
- ticket (string, 可选): 门票信息，如 "免费" 或 "150元"
- openingHours (string, 可选): 开放时间，如 "08:00-17:00"
- phone (string, 可选): 联系电话
- notes (string, 可选): 备注信息

不要添加上述字段以外的任何字段。lngLat 必须是数组格式，不能是字符串。"""


PLACE_SEARCH_PROMPT = """
## 地点搜索模式

用户正在搜索地点信息。请按以下流程执行：

1. 使用 webSearch 工具搜索用户提到的地点或景点信息
2. 从搜索结果中提取地点名称
3. 使用高德地图工具（如 maps_geo 或 maps_text_search）获取每个地点的真实经纬度和地址
4. 将结果整理为标准地点格式返回

重要约束：
- 每个返回的地点必须有真实的经纬度坐标（来自高德地图数据）
- 返回的地点数量建议 3-8 个，太多会让用户难以选择
- 结果中必须包含地点名称、坐标、地址、分类
- 如果搜索不到结果，如实告知用户，不要编造地点"""


TRIP_PLANNER_PROMPT = """
## 行程规划模式

用户正在规划行程。请按以下流程执行：

1. 使用 webSearch 搜索相关景点信息
2. 使用高德地图工具获取每个景点的真实坐标和地址
3. 将景点整理为标准地点格式
4. 最后必须调用 planDayRoute 工具，传入所有景点的名称和真实经纬度
5. 等待用户确认方案后，如用户接受则调用 modifyTripPlan 将景点添加到行程

重要约束：
- planDayRoute 是必须调用的最终步骤，不要只搜索就结束
- 每个景点必须有真实的经纬度（来自高德地图）
- 推荐景点数量 4-8 个为宜
- 回复时说明规划思路，并提示用户可以接受或拒绝方案
- 如果用户指定了当前行程（currentTripId），规划完成后直接添加到该行程"""


MEMORY_PROMPT = """
## 记忆模式

用户正在表达旅行偏好或习惯。请使用 saveUserMemory 工具保存用户的偏好信息。

常见偏好类型：
- 偏好 (preference): "我喜欢美食"、"不喜欢爬山"
- 习惯 (habit): "习惯早起出发"、"喜欢慢节奏旅行"
- 经验 (experience): "上次去千岛湖玩得很好"

保存后向用户确认已记住该偏好。"""


class PromptBuilder:
    """Builds dynamic system prompts based on intent and context."""

    INTENT_PROMPTS = {
        "place_search": PLACE_SEARCH_PROMPT,
        "trip_planner": TRIP_PLANNER_PROMPT,
        "memory": MEMORY_PROMPT,
    }

    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def build(
        self,
        user_id: str,
        intent: Optional[str] = None,
        current_trip_id: Optional[str] = None,
    ) -> str:
        prompt = BASE_PROMPT

        # Add intent-specific guidance
        if intent and intent in self.INTENT_PROMPTS:
            prompt += self.INTENT_PROMPTS[intent]

        # Add user memories
        prompt += await self._load_memories(user_id)

        # Add trip context if editing
        if current_trip_id:
            prompt += await self._load_trip_context(current_trip_id)

        return prompt

    async def _load_memories(self, user_id: str) -> str:
        result = await self.db.execute(
            select(UserMemory).where(UserMemory.userId == user_id)
        )
        memories = result.scalars().all()
        if not memories:
            return ""
        lines = "\n".join(f"- {m.content}" for m in memories)
        return f"\n\n用户旅行偏好（长期记忆）:\n{lines}"

    async def _load_trip_context(self, trip_id: str) -> str:
        result = await self.db.execute(
            select(Trip)
            .where(Trip.id == trip_id)
            .options(selectinload(Trip.days).selectinload(Day.items))
        )
        trip = result.scalar_one_or_none()
        if not trip:
            return ""

        ctx = f'\n\n当前正在编辑的行程: "{trip.title}" (ID: {trip_id})'
        if trip.description:
            ctx += f"\n行程主题: {trip.description}"
        ctx += f"\n行程包含 {len(trip.days)} 天:"
        for day in trip.days:
            place_names = [i.name for i in day.items if i.type == "place"]
            day_desc = f" ({day.description})" if day.description else ""
            ctx += f"\n  第{day.dayIndex}天{day_desc}: {' → '.join(place_names)}"
        return ctx
```

- [ ] **Step 2: Run lint check**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.prompt_builder import PromptBuilder; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/prompt_builder.py
git commit -m "feat(agent): add PromptBuilder with intent-specific prompt templates"
```

---

### Task 4: Intent Handlers — Place Search

**Files:**
- Create: `backend-py/app/agent/handlers/__init__.py`
- Create: `backend-py/app/agent/handlers/place_search.py`

- [ ] **Step 1: Create handlers package**

```python
# backend-py/app/agent/handlers/__init__.py
```

(empty file)

- [ ] **Step 2: Create place search handler**

```python
# backend-py/app/agent/handlers/place_search.py
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.tool_node import ToolNode

from app.agent.message_manager import MessageManager
from app.agent.prompt_builder import PromptBuilder
from app.agent.tool_registry import ToolRegistry
from app.config import settings
from app.logger import logger
from app.models import AgentMessage


async def handle_place_search(
    *,
    user_id: str,
    session_id: str,
    user_message: str,
    current_trip_id: str | None,
    message_manager: MessageManager,
    prompt_builder: PromptBuilder,
    tool_registry: ToolRegistry,
) -> AsyncIterator[str]:
    """Handle the place_search intent: search → geo-encode → return structured places."""

    # Save user message
    await message_manager.save_message(session_id, "user", user_message)

    # Load history and build prompt
    history = await message_manager.load_history(session_id)
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
    token_buffer: list[str] = []
    tool_results_buffer: list[Any] = []

    async for event in agent.astream_events(
        {"messages": langchain_messages},
        version="v2",
        config={"recursion_limit": 30},
    ):
        kind = event["event"]

        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                token_buffer.append(chunk.content)
                yield json.dumps({"type": "token", "content": chunk.content}, ensure_ascii=False) + "\n"

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
                output_str = _stringify_output(output)
                yield json.dumps({
                    "type": "tool_end",
                    "tool": tool_name,
                    "toolCallId": tool_call_id,
                    "output": output_str,
                }, ensure_ascii=False) + "\n"

    # Extract metadata and save
    final_text = "".join(token_buffer) or "已为您搜索到相关地点。"
    metadata = _extract_suggested_places(tool_results_buffer)
    metadata["intent"] = "place_search"

    await message_manager.save_message(session_id, "assistant", final_text, meta=metadata)
    await message_manager.touch_session(
        await message_manager.get_or_create_session(session_id, user_id)
    )

    if metadata.get("suggestedPlaces"):
        yield json.dumps({"type": "meta", "data": metadata}, ensure_ascii=False) + "\n"


def _history_to_langchain(history: list[AgentMessage]) -> list:
    from langchain_core.messages import AIMessage, HumanMessage

    msgs = []
    for msg in history:
        if msg.role == "user":
            msgs.append(HumanMessage(content=msg.content or " "))
        elif msg.role == "assistant":
            msgs.append(AIMessage(content=msg.content or " "))
    return msgs


def _stringify_output(output: Any) -> str:
    if isinstance(output, str):
        return output
    if hasattr(output, "content"):
        return str(output.content)
    if isinstance(output, dict):
        return json.dumps(output, ensure_ascii=False)
    return str(output)


def _extract_suggested_places(tool_results: list[Any]) -> dict:
    """Extract suggestedPlaces from tool call results."""
    metadata: dict = {}
    for result in tool_results:
        try:
            if isinstance(result, str):
                data = json.loads(result)
            elif isinstance(result, dict):
                data = result
            elif hasattr(result, "content"):
                data = json.loads(result.content) if isinstance(result.content, str) else result.content
            else:
                continue
        except (json.JSONDecodeError, TypeError):
            continue

        if not isinstance(data, dict):
            continue

        if data.get("suggested_places"):
            metadata["suggestedPlaces"] = data["suggested_places"]

    return metadata
```

- [ ] **Step 3: Run lint check**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.handlers.place_search import handle_place_search; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend-py/app/agent/handlers/
git commit -m "feat(agent): add place_search intent handler"
```

---

### Task 5: Intent Handlers — Trip Planner

**Files:**
- Create: `backend-py/app/agent/handlers/trip_planner.py`

- [ ] **Step 1: Create trip planner handler**

```python
# backend-py/app/agent/handlers/trip_planner.py
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.tool_node import ToolNode

from app.agent.handlers.place_search import _history_to_langchain, _stringify_output
from app.agent.message_manager import MessageManager
from app.agent.prompt_builder import PromptBuilder
from app.agent.tool_registry import ToolRegistry
from app.config import settings
from app.logger import logger


async def handle_trip_planner(
    *,
    user_id: str,
    session_id: str,
    user_message: str,
    current_trip_id: str | None,
    message_manager: MessageManager,
    prompt_builder: PromptBuilder,
    tool_registry: ToolRegistry,
) -> AsyncIterator[str]:
    """Handle the trip_planner intent: search → plan route → present for approval."""

    await message_manager.save_message(session_id, "user", user_message)

    history = await message_manager.load_history(session_id)
    system_prompt = await prompt_builder.build(user_id, intent="trip_planner", current_trip_id=current_trip_id)

    tools = tool_registry.get_tools_for_intent("trip_planner")
    tool_node = ToolNode(tools, handle_tool_errors=True)

    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.7,
        streaming=True,
    )
    agent = create_react_agent(model=llm, tools=tool_node, prompt=system_prompt, name="trip_planner")

    langchain_messages = _history_to_langchain(history)
    token_buffer: list[str] = []
    tool_results_buffer: list[Any] = []

    async for event in agent.astream_events(
        {"messages": langchain_messages},
        version="v2",
        config={"recursion_limit": 50},
    ):
        kind = event["event"]

        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                token_buffer.append(chunk.content)
                yield json.dumps({"type": "token", "content": chunk.content}, ensure_ascii=False) + "\n"

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
                output_str = _stringify_output(output)
                yield json.dumps({
                    "type": "tool_end",
                    "tool": tool_name,
                    "toolCallId": tool_call_id,
                    "output": output_str,
                }, ensure_ascii=False) + "\n"

    final_text = "".join(token_buffer) or "已为您规划行程。"
    metadata = _extract_trip_metadata(tool_results_buffer)
    metadata["intent"] = "trip_planner"

    await message_manager.save_message(session_id, "assistant", final_text, meta=metadata)
    sess = await message_manager.get_or_create_session(session_id, user_id)
    await message_manager.touch_session(sess)

    if metadata:
        yield json.dumps({"type": "meta", "data": metadata}, ensure_ascii=False) + "\n"


def _extract_trip_metadata(tool_results: list[Any]) -> dict:
    """Extract trip plan metadata from tool results."""
    metadata: dict = {}
    for result in tool_results:
        try:
            if isinstance(result, str):
                data = json.loads(result)
            elif isinstance(result, dict):
                data = result
            elif hasattr(result, "content"):
                data = json.loads(result.content) if isinstance(result.content, str) else result.content
            else:
                continue
        except (json.JSONDecodeError, TypeError):
            continue

        if not isinstance(data, dict):
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
```

- [ ] **Step 2: Run lint check**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.handlers.trip_planner import handle_trip_planner; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/handlers/trip_planner.py
git commit -m "feat(agent): add trip_planner intent handler"
```

---

### Task 6: Intent Handlers — Memory

**Files:**
- Create: `backend-py/app/agent/handlers/memory.py`

- [ ] **Step 1: Create memory handler**

```python
# backend-py/app/agent/handlers/memory.py
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.tool_node import ToolNode

from app.agent.handlers.place_search import _history_to_langchain, _stringify_output
from app.agent.message_manager import MessageManager
from app.agent.prompt_builder import PromptBuilder
from app.agent.tool_registry import ToolRegistry
from app.config import settings
from app.logger import logger


async def handle_memory(
    *,
    user_id: str,
    session_id: str,
    user_message: str,
    message_manager: MessageManager,
    prompt_builder: PromptBuilder,
    tool_registry: ToolRegistry,
) -> AsyncIterator[str]:
    """Handle the memory intent: save user travel preferences."""

    await message_manager.save_message(session_id, "user", user_message)

    history = await message_manager.load_history(session_id)
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
    token_buffer: list[str] = []

    async for event in agent.astream_events(
        {"messages": langchain_messages},
        version="v2",
        config={"recursion_limit": 10},
    ):
        kind = event["event"]

        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                token_buffer.append(chunk.content)
                yield json.dumps({"type": "token", "content": chunk.content}, ensure_ascii=False) + "\n"

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
                output_str = _stringify_output(output)
                yield json.dumps({
                    "type": "tool_end",
                    "tool": tool_name,
                    "toolCallId": tool_call_id,
                    "output": output_str,
                }, ensure_ascii=False) + "\n"

    final_text = "".join(token_buffer) or "已记住您的偏好。"
    metadata = {"intent": "memory"}

    await message_manager.save_message(session_id, "assistant", final_text, meta=metadata)
    sess = await message_manager.get_or_create_session(session_id, user_id)
    await message_manager.touch_session(sess)
```

- [ ] **Step 2: Run lint check**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.handlers.memory import handle_memory; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/handlers/memory.py
git commit -m "feat(agent): add memory intent handler"
```

---

### Task 7: Refactor Engine to Thin Coordinator

**Files:**
- Modify: `backend-py/app/agent/engine.py`

- [ ] **Step 1: Rewrite engine.py**

Replace the entire content of `backend-py/app/agent/engine.py`:

```python
from __future__ import annotations

import json
from typing import AsyncIterator, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.handlers.memory import handle_memory
from app.agent.handlers.place_search import handle_place_search
from app.agent.handlers.trip_planner import handle_trip_planner
from app.agent.message_manager import MessageManager
from app.agent.prompt_builder import PromptBuilder
from app.agent.tool_registry import ToolRegistry
from app.agent.tools import create_local_tools
from app.db.database import async_session_factory
from app.logger import logger

# Intent → handler mapping
_HANDLERS = {
    "place_search": handle_place_search,
    "trip_planner": handle_trip_planner,
    "memory": handle_memory,
}


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
    """Route to the appropriate intent handler and stream events."""
    async with async_session_factory() as db_session:
        message_manager = MessageManager(db_session)
        prompt_builder = PromptBuilder(db_session)
        tool_registry = _build_tool_registry(db_session, user_id)

        # Ensure session exists
        await message_manager.get_or_create_session(session_id, user_id)

        logger.agent.stream_start(session_id)

        # Select handler based on intent
        handler = _HANDLERS.get(intent)
        if handler is None:
            # Default: try trip_planner as the most comprehensive handler
            logger.info("agent", f"No handler for intent '{intent}', defaulting to trip_planner")
            handler = handle_trip_planner

        handler_kwargs = {
            "user_id": user_id,
            "session_id": session_id,
            "user_message": user_message,
            "current_trip_id": current_trip_id,
            "message_manager": message_manager,
            "prompt_builder": prompt_builder,
            "tool_registry": tool_registry,
        }

        # memory handler doesn't need current_trip_id
        if intent == "memory":
            handler_kwargs.pop("current_trip_id", None)

        async for chunk in handler(**handler_kwargs):
            yield chunk

        logger.agent.stream_end(session_id)
```

- [ ] **Step 2: Verify the engine loads**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.engine import stream_chat_with_agent; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/engine.py
git commit -m "refactor(agent): simplify engine to thin coordinator with intent routing"
```

---

### Task 8: Update Routes to Pass Intent

**Files:**
- Modify: `backend-py/app/agent/routes.py`

- [ ] **Step 1: Update agent_chat route to pass intent**

In `backend-py/app/agent/routes.py`, modify the `agent_chat` function. Replace lines 107-148 (the `agent_chat` handler):

```python
@post("/api/agent/sessions/{session_id:str}/chat", guards=[require_auth], media_type="text/event-stream")
async def agent_chat(
    session_id: str,
    data: dict,
    request: Request,
    db_session: AsyncSession,
) -> Any:
    user_id = request.user["id"]
    content = data.get("content", "").strip()
    current_trip_id = data.get("currentTripId")

    if not content:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Message content is required")

    logger.agent.chat(user_id, session_id, content)

    intent_result = classify_intent(content)
    logger.agent.intent(intent_result.category, intent_result.confidence, content)

    if intent_result.category == "harmful":
        reply = "抱歉，我只能帮助旅行规划相关的问题。请不要尝试执行与旅行无关的操作。"
        db_session.add(AgentMessage(sessionId=session_id, role="user", content=content))
        db_session.add(AgentMessage(sessionId=session_id, role="assistant", content=reply,
                                    meta=json.dumps({"intent": "harmful", "blocked": True})))
        await db_session.flush()
        return {"content": reply, "metadata": {"blocked": True, "reason": "harmful", "intent": "harmful"}}

    if intent_result.category == "off_topic":
        reply = "这个问题似乎与旅行规划无关呢～我是旅行规划助手，可以帮你查询目的地、规划行程、推荐景点等。有什么旅行相关的问题我可以帮你的吗？"
        db_session.add(AgentMessage(sessionId=session_id, role="user", content=content))
        db_session.add(AgentMessage(sessionId=session_id, role="assistant", content=reply,
                                    meta=json.dumps({"intent": "off_topic", "blocked": True})))
        await db_session.flush()
        return {"content": reply, "metadata": {"blocked": True, "reason": "off_topic", "intent": "off_topic"}}

    # Map regex intent category to handler intent
    handler_intent = _map_intent(content, intent_result.category)

    logger.agent.stream_start(session_id)

    async def event_stream():
        async for chunk in stream_chat_with_agent(
            user_id, session_id, content, current_trip_id, intent=handler_intent
        ):
            yield chunk

    return Stream(event_stream(), media_type="text/event-stream")


def _map_intent(content: str, category: str) -> str:
    """Map regex intent category to a specific handler intent.

    The regex classifier gives broad categories (trip_related, harmful, off_topic).
    We refine trip_related into place_search, trip_planner, or memory using keywords.
    """
    if category != "trip_related":
        return category  # harmful/off_topic handled above, but pass through

    c = content.lower()

    # Memory keywords
    memory_keywords = ["记住", "喜欢", "不喜欢", "偏好", "习惯", "remember", "prefer", "don't like"]
    if any(kw in c for kw in memory_keywords):
        return "memory"

    # Trip planning keywords
    planner_keywords = [
        "规划", "计划", "安排", "行程", "day", "天", "路线",
        "plan", "itinerary", "schedule",
    ]
    if any(kw in c for kw in planner_keywords):
        return "trip_planner"

    # Default to place search for general travel queries
    return "place_search"
```

- [ ] **Step 2: Verify routes load**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "from app.agent.routes import agent_chat; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/routes.py
git commit -m "feat(agent): pass intent to engine, add keyword-based intent refinement"
```

---

### Task 9: Frontend — Handle Intent in Metadata

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add agentIntent to store state**

In `frontend/src/store/index.ts`, find the agent state section (around line 540-547) and add `agentIntent`:

```typescript
  // Agent state — restore last active session from localStorage
  agentSessions: [],
  activeAgentSessionId: localStorage.getItem('agent_active_session_id'),
  agentMessages: [],
  agentSuggestedPlaces: null,
  agentLoading: false,
  isAgentPanelOpen: false,
  agentPlanRoutes: null,
  agentIntent: null as string | null,
```

- [ ] **Step 2: Update sendAgentMessage to track intent**

In `sendAgentMessage`, after the final metadata update (around line 709-717), add intent tracking:

```typescript
      // Final update
      set(state => ({
        agentMessages: state.agentMessages.map(m =>
          m.id === assistantId
            ? { ...m, content: textContent, metadata, toolSteps: [...toolSteps] }
            : m
        ),
        agentLoading: false,
        agentSuggestedPlaces: metadata.suggestedPlaces || state.agentSuggestedPlaces,
        agentIntent: metadata.intent || state.agentIntent,
      }))
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd /Users/mac/Desktop/pro/trip/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat(frontend): track agent intent in store state"
```

---

### Task 10: Integration Test — Verify End-to-End

**Files:**
- Test manually

- [ ] **Step 1: Start the backend and verify imports**

Run: `cd /Users/mac/Desktop/pro/trip/backend-py && python -c "
from app.agent.engine import stream_chat_with_agent
from app.agent.message_manager import MessageManager
from app.agent.tool_registry import ToolRegistry
from app.agent.prompt_builder import PromptBuilder
from app.agent.handlers.place_search import handle_place_search
from app.agent.handlers.trip_planner import handle_trip_planner
from app.agent.handlers.memory import handle_memory
print('All imports OK')
"`
Expected: `All imports OK`

- [ ] **Step 2: Verify the app starts**

Run: `cd /Users/mac/Desktop/pro/trip && pnpm dev:backend`
Expected: Server starts without errors

- [ ] **Step 3: Commit any fixes if needed**

If any issues were found and fixed during integration testing:

```bash
git add -A
git commit -m "fix(agent): resolve integration issues from refactor"
```
