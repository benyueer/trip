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
    """Handle the place_search intent: search -> geo-encode -> return structured places."""

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
