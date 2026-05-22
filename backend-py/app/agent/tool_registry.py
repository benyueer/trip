from __future__ import annotations

from typing import Optional

from langchain_core.tools import BaseTool

from app.clients.mcp_client import get_mcp_tools


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
