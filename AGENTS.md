# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
# Start everything
pnpm dev:all              # Frontend + Node backend
pnpm dev:frontend         # Vite dev server only
pnpm dev:backend          # Node backend with hot reload

# Python backend (primary, with AI agent)
cd backend-py && source .venv/bin/activate
uvicorn app.main:create_app --factory --reload --port 3001  # or: python -m app

# Database
pnpm --filter backend db:push       # Push Drizzle schema (Node)
cd backend-py && alembic upgrade head  # Run Alembic migrations (Python)

# Build
pnpm --filter frontend build
pnpm --filter backend build
```

## Architecture

Two backends sharing the same PostgreSQL database and API contract (`/api/*`):

**Python backend** (`backend-py/`) — Litestar + SQLModel + LangGraph agent
- Routes → handlers → repository, AMap API proxy
- **Agent system** (`app/agent/`): intent classification → 3 handlers (place_search, trip_planner, memory), tool registry (local + MCP), history compression
- `MessageManager` handles session/message persistence; `PromptBuilder` constructs dynamic system prompts
- `compressor.py` summarizes old history via LLM and truncates large tool results

**Node.js backend** (`backend/`) — Express 5 + Drizzle ORM + Passport auth
- Google/GitHub OAuth via Passport
- Trip CRUD, sharing, user routes
- AI SDK integration (`@ai-sdk/openai`)

**Frontend** (`frontend/`) — React 19 + Vite 8 + Tailwind v4 + TypeScript
- **Zustand** store (`store/index.ts`) — all app state
- **React Router v7** — `/` (trip list), `/trip/:id` (detail)
- **@dnd-kit** — drag-and-drop itinerary reordering
- Agent chat UI: `AgentPanel`, `AgentToolCallCard`, `AgentDayPlanCard`, `AgentSuggestedPlaceCard`

**Data model**: `Trip → Day → Item` (each Item has type, name, lngLat, etc.)
**Agent model**: `AgentSession → AgentMessage` (role: user/assistant/system, meta stores intent + structured data)

## Key Patterns

- Agent handlers are async generators that yield JSON-encoded SSE events (`type: token|tool_start|tool_end|meta`)
- Tool results are JSON-compressed before entering LLM context (`compressor.compress_tool_result`)
- History is summarized when message count exceeds threshold (`compressor.compress_history`)
- `_history_to_langchain()` in `place_search.py` converts DB messages to LangChain format (shared by all handlers)
- Frontend streams agent responses via `fetch` + `ReadableStream`, parsing newline-delimited JSON

## Infra

PostgreSQL 16 via Docker (`dev/docker-compose.yml`). `backend-py/.env` needs `DATABASE_URL`, `LLM_API_KEY`, `LLM_BASE_URL`, `AMAP_WEB_KEY`.
