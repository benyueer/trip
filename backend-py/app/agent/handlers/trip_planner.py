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

from app.agent.compressor import compress_tool_result


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
    """Handle the trip_planner intent: search -> plan route -> present for approval."""

    # Save user message
    await message_manager.save_message(session_id, "user", user_message)

    # Load history (auto-compressed if too long) and build prompt
    history = await message_manager.load_compressed_history(session_id)
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
    token_buffer: list[str] = []
    tool_results_buffer: list[Any] = []

    try:
        async for event in agent.astream_events(
            {"messages": langchain_messages},
            version="v2",
            config={"recursion_limit": 50},
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
                logger.error("agent", f"Event processing error in trip_planner: {event_err}")
                yield json.dumps({"type": "token", "content": f"\n\n[工具调用异常: {event_err}]\n"}, ensure_ascii=False) + "\n"
                continue
    except Exception as e:
        logger.error("agent", f"Stream error in trip_planner: {e}")
        error_msg = "\n\n抱歉，处理过程中出现错误，请重试。"
        yield json.dumps({"type": "token", "content": error_msg}, ensure_ascii=False) + "\n"
        await message_manager.save_message(session_id, "assistant", error_msg, meta={"intent": "trip_planner", "error": True})
        return

    # Extract metadata and save
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
