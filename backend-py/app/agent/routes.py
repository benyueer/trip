from __future__ import annotations

import json
from typing import Any

from litestar import delete, get, patch, post
from litestar import Request
from litestar.exceptions import HTTPException
from litestar.response import Stream
from litestar.status_codes import HTTP_201_CREATED, HTTP_204_NO_CONTENT, HTTP_400_BAD_REQUEST, HTTP_404_NOT_FOUND
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.engine import stream_chat_with_agent
from app.agent.intent import classify_intent
from app.logger import logger
from app.models import AgentMessage, AgentSession, UserMemory
from app.routes.auth import require_auth


@get("/api/agent/sessions", guards=[require_auth])
async def get_agent_sessions(
    request: Request,
    db_session: AsyncSession,
) -> list[dict]:
    user_id = request.user["id"]
    result = await db_session.execute(
        select(AgentSession)
        .where(AgentSession.userId == user_id)
        .order_by(desc(AgentSession.updatedAt))
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "userId": s.userId,
            "title": s.title,
            "createdAt": s.createdAt.isoformat() if s.createdAt else None,
            "updatedAt": s.updatedAt.isoformat() if s.updatedAt else None,
        }
        for s in sessions
    ]


@post("/api/agent/sessions", status_code=HTTP_201_CREATED, guards=[require_auth])
async def create_agent_session(
    data: dict,
    request: Request,
    db_session: AsyncSession,
) -> dict:
    if request.user.get("provider") == "guest":
        raise HTTPException(status_code=403, detail="游客模式只读，无法进行此操作")
    user_id = request.user["id"]
    session = AgentSession(
        userId=user_id,
        title=data.get("title", "新对话"),
    )
    db_session.add(session)
    await db_session.flush()
    await db_session.refresh(session)
    logger.info("agent", "Session created", {"sessionId": session.id[:8], "title": session.title})
    return {
        "id": session.id,
        "userId": session.userId,
        "title": session.title,
        "createdAt": session.createdAt.isoformat() if session.createdAt else None,
        "updatedAt": session.updatedAt.isoformat() if session.updatedAt else None,
    }


@delete("/api/agent/sessions/{session_id:str}", status_code=HTTP_204_NO_CONTENT, guards=[require_auth])
async def delete_agent_session(
    session_id: str,
    request: Request,
    db_session: AsyncSession,
) -> None:
    if request.user.get("provider") == "guest":
        raise HTTPException(status_code=403, detail="游客模式只读，无法进行此操作")
    user_id = request.user["id"]
    result = await db_session.execute(
        select(AgentSession).where(
            (AgentSession.id == session_id) & (AgentSession.userId == user_id)
        )
    )
    session = result.scalar_one_or_none()
    if session:
        await db_session.delete(session)
        logger.info("agent", "Session deleted", {"sessionId": session_id[:8]})


@patch("/api/agent/sessions/{session_id:str}", guards=[require_auth])
async def update_agent_session(
    session_id: str,
    data: dict,
    request: Request,
    db_session: AsyncSession,
) -> dict:
    if request.user.get("provider") == "guest":
        raise HTTPException(status_code=403, detail="游客模式只读，无法进行此操作")
    user_id = request.user["id"]
    result = await db_session.execute(
        select(AgentSession).where(
            (AgentSession.id == session_id) & (AgentSession.userId == user_id)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Session not found")

    title = data.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Title is required")

    session.title = title[:500]
    await db_session.flush()
    logger.info("agent", "Session renamed", {"sessionId": session_id[:8], "title": title})
    return {
        "id": session.id,
        "userId": session.userId,
        "title": session.title,
        "createdAt": session.createdAt.isoformat() if session.createdAt else None,
        "updatedAt": session.updatedAt.isoformat() if session.updatedAt else None,
    }


@get("/api/agent/sessions/{session_id:str}/messages", guards=[require_auth])
async def get_agent_messages(
    session_id: str,
    request: Request,
    db_session: AsyncSession,
) -> list[dict]:
    user_id = request.user["id"]
    session_result = await db_session.execute(
        select(AgentSession).where(
            (AgentSession.id == session_id) & (AgentSession.userId == user_id)
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Session not found")

    result = await db_session.execute(
        select(AgentMessage)
        .where(AgentMessage.sessionId == session_id)
        .order_by(AgentMessage.createdAt.asc())
    )
    messages = result.scalars().all()
    return [
        {
            "id": m.id,
            "sessionId": m.sessionId,
            "role": m.role,
            "content": m.content,
            "metadata": json.loads(m.meta) if m.meta else None,
            "createdAt": m.createdAt.isoformat() if m.createdAt else None,
        }
        for m in messages
    ]


@post("/api/agent/sessions/{session_id:str}/chat", guards=[require_auth], media_type="text/event-stream")
async def agent_chat(
    session_id: str,
    data: dict,
    request: Request,
    db_session: AsyncSession,
) -> Any:
    if request.user.get("provider") == "guest":
        raise HTTPException(status_code=403, detail="游客模式只读，无法进行此操作")
    user_id = request.user["id"]
    content = data.get("content", "").strip()
    current_trip_id = data.get("currentTripId")
    forced_intent = data.get("intent")

    if not content:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Message content is required")

    session_result = await db_session.execute(
        select(AgentSession).where(
            (AgentSession.id == session_id) & (AgentSession.userId == user_id)
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Session not found")

    logger.agent.chat(user_id, session_id, content)

    valid_intents = {"import_itinerary", "place_search", "trip_planner", "memory"}
    if forced_intent in valid_intents:
        handler_intent = forced_intent
        logger.agent.intent(handler_intent, 1.0, f"{content} (Forced by client)")
    else:
        intent_result = classify_intent(content)
        logger.agent.intent(intent_result.category, intent_result.confidence, content)

        if intent_result.category == "harmful":
            reply = "抱歉，我只能帮助旅行规划相关的问题。请不要尝试执行与旅行无关的操作。"
            db_session.add(AgentMessage(sessionId=session_id, role="user", content=content))
            db_session.add(AgentMessage(sessionId=session_id, role="assistant", content=reply,
                                        meta=json.dumps({"intent": "harmful", "blocked": True})))
            await db_session.flush()
            return {"content": reply, "metadata": {"blocked": True, "reason": "harmful", "intent": "harmful"}}

        if intent_result.category == "off_topic":
            reply = "这个问题似乎与旅行规划无关呢～我是旅行规划助手，可以帮你查询目的地、规划行程、推荐景点等。有什么旅行相关的问题我可以帮你的吗？"
            db_session.add(AgentMessage(sessionId=session_id, role="user", content=content))
            db_session.add(AgentMessage(sessionId=session_id, role="assistant", content=reply,
                                        meta=json.dumps({"intent": "off_topic", "blocked": True})))
            await db_session.flush()
            return {"content": reply, "metadata": {"blocked": True, "reason": "off_topic", "intent": "off_topic"}}

        # Map regex intent category to handler intent
        handler_intent = _map_intent(content, intent_result.category)

    logger.agent.stream_start(session_id)

    async def event_stream():
        async for chunk in stream_chat_with_agent(
            user_id, session_id, content, current_trip_id, intent=handler_intent
        ):
            yield chunk

    return Stream(event_stream(), media_type="text/event-stream")


def _map_intent(content: str, category: str) -> str:
    """Map regex intent category to a specific handler intent.

    The regex classifier gives broad categories (trip_related, harmful, off_topic).
    We refine trip_related into place_search, trip_planner, or memory using keywords.
    """
    if category != "trip_related":
        return category

    c = content.lower()

    # Memory keywords
    memory_keywords = ["记住", "喜欢", "不喜欢", "偏好", "习惯", "remember", "prefer", "don't like"]
    if any(kw in c for kw in memory_keywords):
        return "memory"

    # Refined trip planning patterns
    import re
    planner_patterns = [
        r"(规划|计划|安排|行程|日程|路线|修改行程|创建行程)",
        r"(第[一二三四五六七八九十\d]+天)",
        r"(\d+|[一二三四五六七八九十])\s*天",  # e.g., "3天", "三天"
        r"\b(plan|itinerary|schedule|days)\b"
    ]

    if any(re.search(pat, c) for pat in planner_patterns):
        # Exclude general weather queries
        if "天气" in c and not any(re.search(pat, c) for pat in [r"规划", r"计划", r"安排", r"第[一二三四五六七八九十\d]+天"]):
            return "place_search"
        return "trip_planner"

    # Default to place search for general travel queries
    return "place_search"


@get("/api/agent/memories", guards=[require_auth])
async def get_agent_memories(
    request: Request,
    db_session: AsyncSession,
) -> list[dict]:
    user_id = request.user["id"]
    result = await db_session.execute(
        select(UserMemory)
        .where(UserMemory.userId == user_id)
        .order_by(desc(UserMemory.updatedAt))
    )
    memories = result.scalars().all()
    return [
        {
            "id": m.id,
            "userId": m.userId,
            "content": m.content,
            "category": m.category,
            "createdAt": m.createdAt.isoformat() if m.createdAt else None,
            "updatedAt": m.updatedAt.isoformat() if m.updatedAt else None,
        }
        for m in memories
    ]


@delete("/api/agent/memories/{memory_id:str}", status_code=HTTP_204_NO_CONTENT, guards=[require_auth])
async def delete_agent_memory(
    memory_id: str,
    request: Request,
    db_session: AsyncSession,
) -> None:
    if request.user.get("provider") == "guest":
        raise HTTPException(status_code=403, detail="游客模式只读，无法进行此操作")
    user_id = request.user["id"]
    result = await db_session.execute(
        select(UserMemory).where(
            (UserMemory.id == memory_id) & (UserMemory.userId == user_id)
        )
    )
    memory = result.scalar_one_or_none()
    if memory:
        await db_session.delete(memory)
        logger.info("agent", "Memory deleted", {"memoryId": memory_id[:8]})
