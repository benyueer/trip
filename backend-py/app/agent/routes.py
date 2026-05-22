from __future__ import annotations

import json
from typing import Any

from litestar import delete, get, post
from litestar import Request
from litestar.exceptions import HTTPException
from litestar.response import Stream
from litestar.status_codes import HTTP_201_CREATED, HTTP_204_NO_CONTENT, HTTP_400_BAD_REQUEST
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
    user_id = request.user["id"]
    content = data.get("content", "").strip()
    current_trip_id = data.get("currentTripId")

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

    # Trip planning keywords
    planner_keywords = [
        "规划", "计划", "安排", "行程", "day", "天", "路线",
        "plan", "itinerary", "schedule",
    ]
    if any(kw in c for kw in planner_keywords):
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
