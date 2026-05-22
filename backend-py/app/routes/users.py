from __future__ import annotations

from litestar import get
from litestar import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.routes.auth import require_auth


@get("/api/users/search", guards=[require_auth])
async def search_users(
    q: str,
    request: Request,
    db_session: AsyncSession,
) -> list[dict]:
    user_id = request.user["id"]

    if not q or len(q) < 2:
        return []

    result = await db_session.execute(
        select(User).where(User.email.ilike(f"%{q}%")).limit(10)
    )
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "avatar": u.avatar,
        }
        for u in users
        if u.id != user_id
    ]
