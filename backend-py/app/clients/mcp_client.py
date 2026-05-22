from __future__ import annotations

import asyncio
from typing import Any

from langchain_core.tools import BaseTool, ToolException
from langchain_mcp_adapters.client import MultiServerMCPClient

from app.config import settings
from app.logger import logger

_mcp_client: MultiServerMCPClient | None = None
_mcp_tools: list[BaseTool] = []

_MCP_MAX_RETRIES = 3
_MCP_RETRY_DELAY = 1.0


def _wrap_tool_with_retry(tool: BaseTool) -> BaseTool:
    """Wrap an MCP tool with retry logic for transient network errors."""
    original_arun = tool.arun

    async def arun_with_retry(*args: Any, **kwargs: Any) -> Any:
        last_error: Exception | None = None
        for attempt in range(_MCP_MAX_RETRIES):
            try:
                return await original_arun(*args, **kwargs)
            except Exception as e:
                last_error = e
                error_str = str(e).lower()
                # Only retry on transient network errors
                is_transient = any(msg in error_str for msg in [
                    "peer closed connection",
                    "remoteprotocolerror",
                    "connection reset",
                    "broken pipe",
                    "incompleteread",
                ])
                if not is_transient or attempt == _MCP_MAX_RETRIES - 1:
                    raise
                delay = _MCP_RETRY_DELAY * (2 ** attempt)
                logger.warning("mcp", f"MCP tool '{tool.name}' attempt {attempt + 1} failed, retrying in {delay}s: {e}")
                await asyncio.sleep(delay)
        raise last_error  # type: ignore[misc]

    object.__setattr__(tool, 'arun', arun_with_retry)
    return tool


async def connect_mcp_servers() -> None:
    global _mcp_client, _mcp_tools
    if not settings.mcp_amap_url:
        logger.info("mcp", "No MCP URL configured, skipping MCP connection")
        return

    _mcp_client = MultiServerMCPClient(
        {
            "amap-maps": {
                "transport": "http",
                "url": settings.mcp_amap_url,
            },
        }
    )
    raw_tools = await _mcp_client.get_tools()
    _mcp_tools = [_wrap_tool_with_retry(t) for t in raw_tools]
    logger.info("mcp", f"Loaded {len(_mcp_tools)} MCP tools from amap-maps", {
        "tools": [t.name for t in _mcp_tools],
    })


def get_mcp_tools() -> list[BaseTool]:
    return _mcp_tools


async def disconnect_mcp_servers() -> None:
    global _mcp_client, _mcp_tools
    if _mcp_client:
        try:
            await _mcp_client.close()
        except Exception as e:
            logger.warn("mcp", f"Error closing MCP client: {e}")
    _mcp_client = None
    _mcp_tools = []
    logger.info("mcp", "MCP connections disconnected")


def get_mcp_server_status() -> list[dict]:
    if _mcp_client:
        return [
            {
                "name": "amap-maps",
                "connected": True,
                "tools": [t.name for t in _mcp_tools],
            },
        ]
    return []
