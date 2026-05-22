# Migration Plan: LangGraph + langchain-mcp-adapters

## Goal
Replace the hand-written OpenAI API agent loop (`engine.py`) with LangGraph's `create_react_agent` + `langchain-mcp-adapters`, preserving all existing functionality (6 local tools, MCP AMap integration, async SSE streaming, session/memory persistence).

## Files to Change
| File | Action |
|---|---|
| `backend-py/pyproject.toml` | Add dependencies |
| `backend-py/app/agent/engine.py` | Rewrite: remove manual loop, use LangGraph agent |
| `backend-py/app/agent/tools.py` | Refactor: wrap 6 functions as `@tool` decorators |
| `backend-py/app/agent/routes.py` | Minimal update: pass config differently |
| `backend-py/app/clients/mcp_client.py` | Replace with `MultiServerMCPClient` or keep + bridge with `load_mcp_tools` |
| `backend-py/app/agent/__init__.py` | Maybe unchanged |
| `backend-py/app/main.py` | May update MCP startup |

## Phases

### Phase 1 — Add Dependencies

Add to `pyproject.toml`:
```
"langgraph>=0.3"
"langchain-mcp-adapters>=0.2.2"
"langchain-openai>=0.3"
"langchain-core>=0.3"
```

Remove (no longer directly needed):
- `"openai>=1.60"` — replaced by `langchain-openai` (which wraps it)

### Phase 2 — Rewrite MCP Client (`clients/mcp_client.py`)

**Current**: Manual `mcp.ClientSession + streamable_http_client`, bare `call_tool()`, connection lifecycle managed with `asyncio.Event().wait()`.

**New approach**: Use `MultiServerMCPClient` from `langchain-mcp-adapters`:

```python
# backend-py/app/clients/mcp_client.py

from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_core.tools import BaseTool
from app.config import settings
from app.logger import logger

_client: MultiServerMCPClient | None = None
_mcp_tools: list[BaseTool] = []

async def connect_mcp_servers() -> None:
    global _client, _mcp_tools
    if not settings.mcp_amap_url:
        logger.info("mcp", "No MCP URL configured, skipping")
        return
    
    _client = MultiServerMCPClient(
        {
            "amap-maps": {
                "transport": "http",
                "url": settings.mcp_amap_url,
            },
        }
    )
    _mcp_tools = await _client.get_tools()
    logger.info("mcp", f"Loaded {len(_mcp_tools)} MCP tools from amap-maps")

def get_mcp_tools() -> list[BaseTool]:
    return _mcp_tools

async def disconnect_mcp_servers() -> None:
    # MultiServerMCPClient is stateless by default — no explicit cleanup needed
    # But if we need stateful sessions, use `client.session(...)` context manager
    pass

def get_mcp_server_status() -> list[dict]:
    if _client:
        return [{"name": "amap-maps", "connected": True, "tools": [t.name for t in _mcp_tools]}]
    return []
```

**Key decisions**:
- `transport: "http"` works with the existing `streamable_http_client` on the server side
- `MultiServerMCPClient` is stateless by default — each tool call creates a fresh session. For the AMap use case (stateless queries), this is fine.
- No more manual `asyncio.Event().wait()` for keepalive — the client handles connection lifecycle.

### Phase 3 — Rewrite Tools (`tools.py`)

**Current**: Exported async functions with manual JSON I/O, `ToolResultStore` singleton for metadata passing.

**New**: Decorate each function with `@tool` from `langchain_core.tools`, return structured dicts directly. Remove `ToolResultStore` — metadata is extracted from agent state after execution.

```python
# backend-py/app/agent/tools.py (key signatures)

from langchain_core.tools import tool

@tool
async def query_local_places(query: str, db_session: AsyncSession, limit: int = 10) -> dict:
    """Search for travel destinations, attractions, and places in the local database."""
    # ... same logic, return {"places": [...], "count": N}

@tool
async def web_search(query: str) -> dict:
    """Search the web for latest travel information."""
    # ... same logic

@tool
async def save_user_memory(user_id: str, content: str, category: str = "preference") -> dict:
    """Save a user travel preference or fact."""
    # ... same logic

@tool
async def create_trip_plan(user_id: str, title: str, days: list[dict], description: str = "") -> dict:
    """Create a new trip itinerary with multiple days and places."""
    # ... same logic

@tool
async def modify_trip_plan(trip_id: str, action: str, day_index: int, place_name: str, new_place: dict | None = None) -> dict:
    """Modify an existing trip: add, remove, or replace a place."""
    # ... same logic

@tool
async def plan_day_route(day_index: int, title: str, places: list[dict], description: str = "") -> dict:
    """Plan a single day itinerary with ordered places and routing."""
    # ... same logic, BUT remove ToolResultStore — metadata returned in response
```

**`@tool` limitations to handle**:
- `@tool` doesn't support `db_session` injection directly. Solutions:
  - **Option A (recommended)**: Use `functools.partial` or closure at agent build time to bind `db_session` and `user_id`
  - **Option B**: Make tools internally open their own DB session (already done for `save_user_memory`, `create_trip_plan`)
  
  Recommendation: Use a `ToolFactory` pattern:
  ```python
  def create_tools(db_session, user_id) -> list[BaseTool]:
      @tool
      async def query_local_places(query: str, limit: int = 10) -> dict:
          """Search for travel destinations..."""
          return await _do_query_local_places(query, db_session, limit)
      
      @tool
      async def save_user_memory_(content: str, category: str = "preference") -> dict:
          """Save a user travel preference or fact."""
          return await save_user_memory(user_id, content, category, db_session)
      # ...
      return [query_local_places, web_search, save_user_memory_, create_trip_plan_, modify_trip_plan_, plan_day_route_]
  ```

### Phase 4 — Rewrite Engine (`engine.py`)

**Current**: Manual OpenAI API call in `for turn in range(max_turns)` loop, manual tool_call dispatch, manual streaming via `yield`.

**New**: Use `create_react_agent` + `ChatOpenAI` from `langchain-openai`, stream via `astream_events`.

```python
# backend-py/app/agent/engine.py (core pattern)

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, SystemMessage
from app.config import settings

def build_agent(db_session, user_id, current_trip_id=None):
    # Build system prompt (same as current, with memory + trip context injected)
    system_prompt = _build_system_prompt(db_session, user_id, current_trip_id)
    
    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.7,
        streaming=True,  # Required for token-level streaming
    )
    
    # Merge local + MCP tools
    from app.agent.tools import create_local_tools
    from app.clients.mcp_client import get_mcp_tools
    tools = create_local_tools(db_session, user_id) + get_mcp_tools()
    
    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=system_prompt,
        # Recur limit matches current max_turns=15
        # recur_limit is a graph-level concept — handled by create_react_agent
    )
    return agent

async def stream_chat_with_agent(
    user_id: str,
    session_id: str,
    user_message: str,
    db_session: AsyncSession,
    current_trip_id: str | None = None,
) -> AsyncIterator[str]:
    # 1. Save user message to DB (same as before)
    # 2. Load history from DB (last 20 messages, same as before)
    # 3. Build agent with context
    agent = build_agent(db_session, user_id, current_trip_id)
    
    # 4. Convert DB messages to LangChain message format
    messages = _history_to_langchain(history)
    messages.append(HumanMessage(content=user_message))
    
    # 5. Stream via astream_events
    async for event in agent.astream_events(
        {"messages": messages},
        version="v2",
    ):
        kind = event["event"]
        name = event.get("name", "")
        
        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                yield chunk.content
        
        elif kind == "on_tool_start":
            # Optionally emit tool start for frontend
            yield f"\n__TOOL_START__{name}\n"
        
        elif kind == "on_tool_end":
            yield f"\n__TOOL_END__{name}\n"
        
        elif kind == "on_chain_end" and name == "LangGraph":
            # Extract final state for metadata
            final_state = event["data"]["output"]
            metadata = _extract_metadata(final_state)
            if metadata:
                yield f"\n__AGENT_META__{json.dumps(metadata, ensure_ascii=False)}"
    
    # 6. Save assistant response to DB
    # Need to reconstruct the full response from the accumulated chunks
    # See "Streaming + DB Persistence" note below
```

### Phase 5 — Update Routes (`routes.py`)

Minimal change: `agent_chat` handler stays the same — it calls `stream_chat_with_agent` and wraps its output in `Stream()`. Only the inner implementation changes.

### Phase 6 — Update main.py

The `on_startup` hook remains — it calls `connect_mcp_servers()`. No change to the startup flow.

## Streaming + DB Persistence Design

**Challenge**: The current code yields tokens and then at the end determines metadata from `tool_result_store`. With LangGraph, the final assistant message + metadata is only available at `on_chain_end`.

**Solution**: Two-pass streaming:

1. **Token pass**: `astream_events` yields tokens immediately to the SSE response
2. **Buffer pass**: Accumulate tokens in a list/buffer; when `on_chain_end` fires, save the complete message + metadata to DB

```python
buffer = []
metadata = {}

async for event in agent.astream_events(...):
    if kind == "on_chat_model_stream":
        chunk = event["data"]["chunk"].content
        if chunk:
            buffer.append(chunk)
            yield chunk
    elif kind == "on_chain_end" and name == "LangGraph":
        # Extract metadata from final state
        final_state = event["data"]["output"]
        metadata = _extract_metadata(final_state)

# After loop: save to DB
full_text = "".join(buffer)
db_session.add(AgentMessage(
    sessionId=session_id,
    role="assistant",
    content=full_text,
    meta=json.dumps(metadata, ensure_ascii=False) if metadata else None,
))
await db_session.flush()
```

## Metadata Extraction Strategy

**Current**: Side-effect singleton `ToolResultStore` — tools write to it, engine reads from it after the loop.

**New**: Extract metadata from LangGraph's final state. The `create_react_agent` output state contains `messages` — the last message is the final AIMessage. Tool results are available as intermediate `ToolMessage`s.

```python
def _extract_metadata(final_state: dict) -> dict:
    messages = final_state.get("messages", [])
    metadata = {}
    for msg in messages:
        if isinstance(msg, AIMessage) and msg.response_metadata:
            # Extract reasoning content if available
            if msg.response_metadata.get("reasoning_content"):
                metadata["reasoning"] = msg.response_metadata["reasoning_content"]
        if isinstance(msg, ToolMessage):
            try:
                data = json.loads(msg.content) if isinstance(msg.content, str) else msg.content
            except (json.JSONDecodeError, TypeError):
                continue
            if isinstance(data, dict):
                if "tripId" in data:
                    metadata["tripId"] = data["tripId"]
                if "title" in data and "tripId" not in metadata:
                    metadata["tripTitle"] = data["title"]
                if "plan" in data:
                    metadata["dayPlan"] = data["plan"]
    return metadata
```

## History Message Conversion

Convert DB `AgentMessage` rows to LangChain message objects:

```python
def _history_to_langchain(history: list[AgentMessage]) -> list:
    msgs = []
    for msg in history:
        if msg.role == "user":
            msgs.append(HumanMessage(content=msg.content or " "))
        elif msg.role == "assistant":
            meta = {}
            if msg.meta:
                try:
                    meta = json.loads(msg.meta) if isinstance(msg.meta, str) else msg.meta
                except (json.JSONDecodeError, TypeError):
                    meta = {}
            reasoning = meta.get("reasoning", "")
            msgs.append(AIMessage(
                content=msg.content or " ",
                # reasoning_content is set in response_metadata
                response_metadata={"reasoning_content": reasoning} if reasoning else {},
            ))
    return msgs
```

## Edge Cases & Risks

| Risk | Mitigation |
|---|---|
| `@tool` doesn't inject `db_session` | ToolFactory closure pattern (Phase 3 Option A) |
| MCP tools and local tools have name collisions | `tool_name_prefix=True` on `MultiServerMCPClient`, or namespace local tools |
| `streaming=True` doesn't work with some base URLs | Test with `settings.llm_base_url`. Falls back to buffering if streaming unsupported |
| `astream_events` v2 vs v3 API drift | Pin to `version="v2"` which is stable as of 2026 |
| LangGraph recursion limit | `create_react_agent` default is fine; can pass `recursion_limit=20` if needed |
| DB session lifecycle (tools + engine sharing same session) | `db_session` is bound at tool creation time via closure — same session throughout a single request |
| MCP connection lost during long chat | `MultiServerMCPClient` stateless mode reconnects per call — no long-lived connection to lose |

## Rollback Strategy

Each phase is independently revertible:
- Phase 1: `git revert` pyproject.toml changes
- Phase 2: Restore original `mcp_client.py`
- Phase 3 + 4: Keep old `engine.py` as `engine_legacy.py` during transition
- Phase 5: `routes.py` calls either `stream_chat_with_agent` or new version via feature flag

## Verification Checklist

- [ ] `pnpm --filter backend dev` starts without errors
- [ ] MCP tools appear in agent (status endpoint or log)
- [ ] Chat sends message, gets streaming response
- [ ] Tool calls execute (queryLocalPlaces, webSearch, etc.)
- [ ] Tool results are visible in streaming output
- [ ] Trip creation/modification works (createTripPlan, modifyTripPlan)
- [ ] Day route planning works (planDayRoute)
- [ ] Memories are saved and loaded (saveUserMemory)
- [ ] Multi-turn conversation preserves context
- [ ] Frontend SSE parsing still works
- [ ] `__AGENT_META__` metadata is emitted correctly
- [ ] DB messages saved correctly for all turns
