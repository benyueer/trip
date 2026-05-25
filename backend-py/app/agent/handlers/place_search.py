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

from app.agent.compressor import compress_tool_result


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
    """Handle the place_search intent: search -> geo-encode -> return structured places."""

    # Save user message
    await message_manager.save_message(session_id, "user", user_message)

    # Load history (auto-compressed if too long) and build prompt
    history = await message_manager.load_compressed_history(session_id)
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

    try:
        async for event in agent.astream_events(
            {"messages": langchain_messages},
            version="v2",
            config={"recursion_limit": 30},
        ):
            try:
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
                        output_str = compress_tool_result(output)
                        yield json.dumps({
                            "type": "tool_end",
                            "tool": tool_name,
                            "toolCallId": tool_call_id,
                            "output": output_str,
                        }, ensure_ascii=False) + "\n"
            except Exception as event_err:
                logger.error("agent", f"Event processing error in place_search: {event_err}")
                yield json.dumps({"type": "token", "content": f"\n\n[工具调用异常: {event_err}]\n"}, ensure_ascii=False) + "\n"
                continue
    except Exception as e:
        logger.error("agent", f"Stream error in place_search: {e}")
        error_msg = "\n\n抱歉，处理过程中出现错误，请重试。"
        yield json.dumps({"type": "token", "content": error_msg}, ensure_ascii=False) + "\n"
        await message_manager.save_message(session_id, "assistant", error_msg, meta={"intent": "place_search", "error": True})
        return

    # Extract metadata and save
    final_text = "".join(token_buffer) or "已为您搜索到相关地点。"
    metadata = _extract_places_metadata(tool_results_buffer)
    metadata["intent"] = "place_search"

    await message_manager.save_message(session_id, "assistant", final_text, meta=metadata)
    sess = await message_manager.get_or_create_session(session_id, user_id)
    await message_manager.touch_session(sess)

    yield json.dumps({"type": "meta", "data": metadata}, ensure_ascii=False) + "\n"


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


def _stringify_output(output: Any) -> str:
    if isinstance(output, str):
        return output
    if hasattr(output, "content"):
        return str(output.content)
    if isinstance(output, dict):
        return json.dumps(output, ensure_ascii=False)
    return str(output)


def _extract_places_metadata(tool_results: list[Any]) -> dict:
    """Extract place data from tool call results.

    Processes ALL tool results (no early break). Separates structured
    place data (with lngLat) from webSearch results (without coordinates).
    Prefers structured data; only falls back to webSearch results if
    no structured places were found.
    """
    metadata: dict = {}
    structured: list[dict] = []   # has lngLat
    fallback: list[dict] = []     # from webSearch, no lngLat

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

        # Scan all list-valued keys for place items
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
                # AMap returns location as "lng,lat" string
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

    # Prefer structured places; fall back to webSearch results
    all_places = structured if structured else fallback

    if all_places:
        # De-duplicate by name
        seen: set[str] = set()
        unique: list[dict] = []
        for p in all_places:
            key = str(p.get("name", ""))
            if key and key not in seen:
                seen.add(key)
                unique.append(p)
        metadata["suggestedPlaces"] = unique

    return metadata
