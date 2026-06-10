# backend-py/app/agent/message_manager.py
from __future__ import annotations

import json
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import AgentMessage, AgentSession, _utcnow


class MessageManager:
    """Handles session lifecycle and message persistence."""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def get_or_create_session(
        self, session_id: str, user_id: str, title: str = "新对话"
    ) -> AgentSession:
        result = await self.db.execute(
            select(AgentSession).where(AgentSession.id == session_id)
        )
        sess = result.scalar_one_or_none()
        if not sess:
            sess = AgentSession(id=session_id, userId=user_id, title=title)
            self.db.add(sess)
            await self.db.flush()
        return sess

    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        meta: Optional[dict] = None,
    ) -> AgentMessage:
        msg = AgentMessage(
            sessionId=session_id,
            role=role,
            content=content,
            meta=json.dumps(meta, ensure_ascii=False) if meta else None,
        )
        self.db.add(msg)
        await self.db.flush()
        return msg

    async def load_history(
        self, session_id: str, limit: int = 20
    ) -> list[AgentMessage]:
        result = await self.db.execute(
            select(AgentMessage)
            .where(AgentMessage.sessionId == session_id)
            .order_by(AgentMessage.createdAt.desc())
            .limit(limit)
        )
        return list(reversed(result.scalars().all()))

    async def load_compressed_history(
        self, session_id: str, limit: int = 20
    ) -> list[AgentMessage]:
        """Load history and auto-compress if it exceeds the threshold.

        When compressed, persists the summary as a system message so it
        survives across turns. Returns the (possibly compressed) history.
        """
        from app.agent.compressor import compress_history

        history = await self.load_history(session_id, limit)
        if len(history) <= settings.agent_history_threshold:
            return history

        old_count = len(history) - settings.agent_history_keep_recent
        history = await compress_history(history)
        for msg in history:
            if msg.id == "summary":
                await self.save_summary(session_id, msg.content, old_count)
        return history

    async def update_session_title(self, session: AgentSession, title: str) -> None:
        session.title = title
        await self.db.flush()

    async def touch_session(self, session: AgentSession) -> None:
        session.updatedAt = _utcnow()
        await self.db.flush()

    async def save_summary(
        self,
        session_id: str,
        summary_content: str,
        summarized_count: int,
    ) -> AgentMessage:
        """Save a compressed history summary as a system message."""
        meta = json.dumps(
            {"type": "summary", "summarizedCount": summarized_count},
            ensure_ascii=False,
        )
        msg = AgentMessage(
            sessionId=session_id,
            role="system",
            content=summary_content,
            meta=meta,
        )
        self.db.add(msg)
        await self.db.flush()
        return msg
