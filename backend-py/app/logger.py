from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional


class _C:
    reset = "\x1b[0m"
    dim = "\x1b[2m"
    red = "\x1b[31m"
    green = "\x1b[32m"
    yellow = "\x1b[33m"
    blue = "\x1b[34m"
    magenta = "\x1b[35m"
    cyan = "\x1b[36m"
    gray = "\x1b[90m"


def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _log(level: str, color: str, tag: str, msg: str, data: Optional[dict] = None) -> None:
    prefix = f"{_C.gray}{_ts()}{_C.reset} {color}{level}{_C.reset} {_C.cyan}[{tag}]{_C.reset}"
    extra = f" {_C.dim}{json.dumps(data, ensure_ascii=False)}{_C.reset}" if data else ""
    print(f"{prefix} {msg}{extra}")


class _AgentLogger:
    @staticmethod
    def chat(user_id: str, session_id: str, message: str) -> None:
        _log("CHAT ", _C.blue, "agent", f"user[{user_id[:8]}] session[{session_id[:8]}]",
             {"message": message[:200]})

    @staticmethod
    def intent(category: str, confidence: float, input_str: str) -> None:
        _log("INTENT", _C.yellow, "agent", f"{category} ({confidence})",
             {"input": input_str[:100]})

    @staticmethod
    def tool_call(tool_name: str, args: Optional[Any] = None) -> None:
        _log("TOOL ", _C.magenta, "agent", f"\u2192 {tool_name}",
             {"args": json.dumps(args, ensure_ascii=False)[:200]} if args else None)

    @staticmethod
    def tool_result(tool_name: str, output: Any) -> None:
        _log("TOOL ", _C.magenta, "agent", f"\u2190 {tool_name}",
             {"output": json.dumps(output, ensure_ascii=False)[:200]})

    @staticmethod
    def stream_start(session_id: str) -> None:
        _log("STREAM", _C.cyan, "agent", f"streaming started [{session_id[:8]}]")

    @staticmethod
    def stream_end(session_id: str, text_length: int) -> None:
        _log("STREAM", _C.cyan, "agent", f"streaming ended [{session_id[:8]}]",
             {"chars": text_length})

    @staticmethod
    def blocked(category: str, input_str: str) -> None:
        _log("BLOCK", _C.red, "agent", f"blocked {category}",
             {"input": input_str[:100]})

    @staticmethod
    def memory(action: str, content: str) -> None:
        _log("MEMORY", _C.green, "agent", action,
             {"content": content[:100]})

    @staticmethod
    def trip_created(trip_id: str, title: str) -> None:
        _log("TRIP ", _C.green, "agent", "created",
             {"tripId": trip_id[:8], "title": title})

    @staticmethod
    def trip_modified(trip_id: str, action: str) -> None:
        _log("TRIP ", _C.yellow, "agent", f"modified: {action}",
             {"tripId": trip_id[:8]})


class Logger:
    @staticmethod
    def info(tag: str, msg: str, data: Optional[dict] = None) -> None:
        _log("INFO ", _C.green, tag, msg, data)

    @staticmethod
    def warn(tag: str, msg: str, data: Optional[dict] = None) -> None:
        _log("WARN ", _C.yellow, tag, msg, data)

    @staticmethod
    def error(tag: str, msg: str, data: Optional[dict] = None) -> None:
        _log("ERROR", _C.red, tag, msg, data)

    agent = _AgentLogger()


logger = Logger()
