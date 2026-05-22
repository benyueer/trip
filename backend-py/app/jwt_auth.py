from datetime import timedelta

from litestar.connection import ASGIConnection
from litestar.security.jwt import JWTCookieAuth
from litestar.security.jwt.token import Token

from app.config import settings


async def retrieve_user_handler(token: Token, _: ASGIConnection) -> dict | None:
    return token.extras.get("user")


jwt_auth = JWTCookieAuth(
    token_secret=settings.session_secret,
    retrieve_user_handler=retrieve_user_handler,
    default_token_expiration=timedelta(days=7),
    exclude=[
        "/auth/dev-login",
        "/auth/google",
        "/auth/google/callback",
        "/auth/github",
        "/auth/github/callback",
        "/schema",
        "/schema/*",
    ],
)
