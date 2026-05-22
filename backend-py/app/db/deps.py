from __future__ import annotations

from collections.abc import AsyncGenerator

from litestar.di import Provide

from app.db.database import async_session_factory


async def provide_db_session() -> AsyncGenerator:  # type: ignore[misc]
    from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


dependencies = {
    "db_session": Provide(provide_db_session),
}
