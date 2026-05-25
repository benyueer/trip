"""Shared utilities for agent handlers."""
from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.models import AgentMessage


def history_to_langchain(history: list[AgentMessage]) -> list:
    """Convert AgentMessage list to LangChain message format."""
    msgs = []
    for msg in history:
        if msg.role == "user":
            msgs.append(HumanMessage(content=msg.content or " "))
        elif msg.role == "assistant":
            msgs.append(AIMessage(content=msg.content or " "))
        elif msg.role == "system":
            msgs.append(SystemMessage(content=msg.content or " "))
    return msgs


def stringify_output(output: Any) -> str:
    """Convert tool output to string for display."""
    if isinstance(output, str):
        return output
    if hasattr(output, "content"):
        return str(output.content)
    if isinstance(output, dict):
        return json.dumps(output, ensure_ascii=False)
    return str(output)
