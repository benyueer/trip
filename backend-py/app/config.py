from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    port: int = 3001
    client_url: str = "http://localhost:5173"
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/trip_planner"
    session_secret: str = "change-me-to-a-random-string-at-least-32-chars"
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    amap_web_key: str = ""
    llm_api_key: str = ""
    llm_base_url: str = "https://token-plan-cn.xiaomimimo.com/v1"
    llm_model: str = "mimo-v2.5-pro"
    tavily_api_key: str = ""
    mcp_amap_url: str = ""

    # Agent compression settings
    agent_history_threshold: int = 15        # Trigger compression when history exceeds this many messages
    agent_history_keep_recent: int = 4       # Keep this many recent messages uncompressed
    agent_tool_result_max_chars: int = 2000  # Max characters for tool results before truncation
    agent_compress_model: str = ""           # Model for summarization (defaults to llm_model if empty)

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
