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
