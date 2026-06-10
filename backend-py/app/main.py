from litestar import Litestar
from litestar.config.cors import CORSConfig

from app.clients.mcp_client import connect_mcp_servers, disconnect_mcp_servers
from app.config import settings
from app.db.database import engine
from app.db.deps import dependencies
from app.logger import logger
from app.agent.routes import (
    agent_chat,
    create_agent_session,
    delete_agent_memory,
    delete_agent_session,
    get_agent_memories,
    get_agent_messages,
    get_agent_sessions,
    update_agent_session,
)
from app.jwt_auth import jwt_auth
from app.routes.auth import (
    auth_me,
    auth_logout,
    auth_register,
    auth_login,
    auth_guest_login,
)
from app.routes.mcp import mcp_message, mcp_sse
from app.routes.shares import create_share, delete_share, list_shares
from app.routes.trips import (
    calculate_and_add_route,
    create_trip,
    delete_trip,
    get_all_places,
    get_all_trips,
    get_trip_by_id,
    update_trip,
)
from app.routes.users import search_users


async def on_startup() -> None:
    try:
        await connect_mcp_servers()
    except Exception as e:
        logger.error("app", "MCP connection error", {"error": str(e)})


async def on_shutdown() -> None:
    await disconnect_mcp_servers()
    await engine.dispose()


cors_config = CORSConfig(
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3001",
        "http://0.0.0.0:5173",
        "http://0.0.0.0:3001",
        "http://192.168.8.48:5173",
        "http://192.168.8.48:3001",
    ],
    allow_credentials=True,
)


def create_app() -> Litestar:
    return Litestar(
        cors_config=cors_config,
        route_handlers=[
            auth_me,
            auth_logout,
            auth_register,
            auth_login,
            auth_guest_login,
            get_all_trips,
            get_all_places,
            get_trip_by_id,
            create_trip,
            update_trip,
            delete_trip,
            calculate_and_add_route,
            list_shares,
            create_share,
            delete_share,
            search_users,
            get_agent_sessions,
            create_agent_session,
            update_agent_session,
            delete_agent_session,
            get_agent_messages,
            agent_chat,
            get_agent_memories,
            delete_agent_memory,
            mcp_sse,
            mcp_message,
        ],
        dependencies={
            "db_session": dependencies["db_session"],
        },
        on_app_init=[jwt_auth.on_app_init],
        on_startup=[on_startup],
        on_shutdown=[on_shutdown],
        debug=True,
    )
