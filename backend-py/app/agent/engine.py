from __future__ import annotations

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

# Intent -> handler mapping
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
