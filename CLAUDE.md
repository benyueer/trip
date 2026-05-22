# CLAUDE.md

Trip planning app — monorepo (pnpm workspaces) with interactive maps and drag-and-drop itinerary.

## Commands

```bash
pnpm dev:all            # Frontend + backend
pnpm dev:frontend       # Vite dev server only
pnpm dev:backend        # Backend with hot reload
pnpm --filter backend db:push    # Push schema to DB
pnpm --filter backend db:studio  # Drizzle Studio
pnpm --filter backend build      # Build backend
pnpm --filter frontend build     # Build frontend
```

## Architecture

**Data**: `Trip → Day → Item` (PostgreSQL + Drizzle ORM)

**Backend** (`backend/src/`): Express 5, Routes → Controllers → Repository, AMap API proxy for routing

**Frontend** (`frontend/src/`): React 19 + Vite 8 + Tailwind v4 + TypeScript
- **Zustand** store — all state in `store/index.ts`
- **React Router v7** — `/` (trip list), `/trip/:id` (detail)
- **@dnd-kit** — drag-and-drop reordering
- Key components: MapContainer (AMap), FloatingPanel (day tabs + items), PlaceModal (place form)

**Infra**: PostgreSQL 16 (Docker), `backend/.env` needs `DATABASE_URL` + `AMAP_WEB_KEY`
