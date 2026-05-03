# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev:all        # Run both frontend and backend concurrently
pnpm dev:frontend   # Run Vite dev server (frontend only)
pnpm dev:backend    # Run backend via ts-node-dev with hot reload

# Database
pnpm --filter backend db:push    # Push schema changes to DB (drizzle-kit push)
pnpm --filter backend db:studio  # Open Drizzle Studio

# Build
pnpm --filter backend build      # Compile TypeScript backend
pnpm --filter frontend build     # Build frontend for production
```

## Architecture

Full-stack monorepo (pnpm workspaces) for a trip planning application with interactive maps and drag-and-drop itinerary management.

### Data Model (PostgreSQL via Drizzle ORM)

```
Trip → Day → Item (polymorphic: place or route)
```

- **Trip**: Title + timestamps
- **Day**: Ordered by dayIndex within a trip (cascading delete)
- **Item**: Can be a `place` (lngLat location, address, phone, rating, category, ticket, description, openingHours) or a `route` (distance, duration, path as [lng,lat][])

### Backend (`backend/src/`)

- **Express 5** server on port 3001
- **Routes** → **Controllers** → **Repository** pattern
- Repository uses Drizzle ORM with transactions for creates/updates (delete-and-reinsert days on update)
- **AMap API** integration for driving/walking/cycling route calculation (server-side proxy)
- DB connection via `node-postgres` pool with `drizzle-orm/node-postgres`

### Frontend (`frontend/src/`)

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** (via @tailwindcss/vite plugin)
- **Zustand** store (`store/index.ts`) — single store with all trip actions and routing state
- **React Router v7** — two routes: `/` (trip list) and `/trip/:id` (trip detail)
- **AMap JSAPI** loaded via `@amap/amap-jsapi-loader` — map is in MapContainer component
- **@dnd-kit** — drag-and-drop for reordering items within a day and moving between days
- **Framer Motion** — animations for panel transitions and list items
- **lucide-react** — icons

### Key Frontend Components

- **MapContainer** — AMap map with markers (places and route polylines), click-to-add-place, routing interaction
- **FloatingPanel** — Day tabs + draggable item list, routing mode UI, delete/add day controls
- **PlaceModal** — Form for adding/editing place details (name, description, ticket, address, phone, opening hours, notes, category)

### State Management (Zustand)

Key store slices:
- CRUD operations: `fetchTrips`, `fetchTripById`, `createTrip`, `deleteTrip`, `updateCurrentTrip`
- Day management: `addDay`, `deleteDay`
- Item operations: `addPlace`, `updatePlace`, `deleteItem`, `reorderItems`, `moveItem`
- Routing flow: `calculateAndAddRoute`, `startRouting`, `cancelRouting`, `setRoutingStart`, `setRoutingEnd`

### Infrastructure

- **PostgreSQL 16** via Docker Compose (`dev/docker-compose.yml`)
- .env file at `backend/.env` expects `DATABASE_URL` and `AMAP_WEB_KEY`
