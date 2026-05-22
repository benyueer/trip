from __future__ import annotations

from typing import Any

from litestar import get, post
from litestar.connection import ASGIConnection
from litestar.datastructures import Cookie
from litestar.exceptions import HTTPException, NotAuthorizedException
from litestar.response import Redirect, Response
from litestar.status_codes import HTTP_501_NOT_IMPLEMENTED
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.jwt_auth import jwt_auth
from app.models import User


def require_auth(connection: ASGIConnection, _: Any) -> None:
    user = connection.user
    if not user:
        raise NotAuthorizedException("Authentication required")


@get("/auth/me")
async def auth_me(request: Any) -> Any:
    return request.user


@post("/auth/logout")
async def auth_logout() -> Response:
    return Response(
        content={"success": True},
        cookies=[Cookie(key="token", value="", max_age=0, path="/")],
    )


@get("/auth/dev-login")
async def auth_dev_login(request: Any, db_session: AsyncSession) -> Any:
    result = await db_session.execute(
        select(User).where(User.provider == "dev")
    )
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            email="dev@localhost",
            name="Dev User",
            provider="dev",
            providerId="dev-user",
        )
        db_session.add(user)
        await db_session.flush()

    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar": user.avatar,
        "provider": user.provider,
        "providerId": user.providerId,
    }
    return jwt_auth.login(identifier=user.id, token_extras={"user": user_data}, response_body=user_data)


@get("/auth/google")
async def auth_google(request: Any) -> Any:
    from app.config import settings
    if not settings.google_client_id:
        raise HTTPException(status_code=HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth not configured")
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": f"{request.base_url}auth/google/callback",
        "response_type": "code",
        "scope": "profile email",
    })
    return Redirect(f"https://accounts.google.com/o/oauth2/auth?{params}")


@get("/auth/google/callback")
async def auth_google_callback(request: Any, code: str, db_session: AsyncSession) -> Any:
    from app.config import settings
    if not settings.google_client_id:
        raise HTTPException(status_code=HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth not configured")
    return Redirect(settings.client_url or "/")


@get("/auth/github")
async def auth_github(request: Any) -> Any:
    from app.config import settings
    if not settings.github_client_id:
        raise HTTPException(status_code=HTTP_501_NOT_IMPLEMENTED, detail="GitHub OAuth not configured")
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": settings.github_client_id,
        "redirect_uri": f"{request.base_url}auth/github/callback",
        "response_type": "code",
        "scope": "user:email",
    })
    return Redirect(f"https://github.com/login/oauth/authorize?{params}")


@get("/auth/github/callback")
async def auth_github_callback(request: Any, code: str, db_session: AsyncSession) -> Any:
    from app.config import settings
    if not settings.github_client_id:
        raise HTTPException(status_code=HTTP_501_NOT_IMPLEMENTED, detail="GitHub OAuth not configured")
    return Redirect(settings.client_url or "/")
