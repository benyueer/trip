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

    try:
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
    except Exception as e:
        logger.error("agent", f"Stream error in memory: {e}")
        error_msg = "\n\n抱歉，处理过程中出现错误，请重试。"
        yield json.dumps({"type": "token", "content": error_msg}, ensure_ascii=False) + "\n"
        await message_manager.save_message(session_id, "assistant", error_msg, meta={"intent": "memory", "error": True})
        return

    final_text = "".join(token_buffer) or "已记住您的偏好。"
    metadata = {"intent": "memory"}

    await message_manager.save_message(session_id, "assistant", final_text, meta=metadata)
    sess = await message_manager.get_or_create_session(session_id, user_id)
    await message_manager.touch_session(sess)
