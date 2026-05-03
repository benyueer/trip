# User Authentication & Trip Sharing Design

## Goal

Add user accounts via OAuth (Google + GitHub), enforce trip ownership, and enable sharing trips between users.

## Decisions

| Decision | Choice |
|----------|--------|
| OAuth providers | Google + GitHub |
| Auth library | Passport.js |
| Session store | PostgreSQL (connect-pg-simple) |
| Data isolation | Trip ownership required |
| Sharing | Invite by user (email search) |
| Auth UI | Login page/modal |

---

## 1. Data Model Changes

### New: `User` table

```ts
pgTable('User', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatar: text('avatar'),
  provider: text('provider').notNull(),       // 'google' | 'github'
  providerId: text('providerId').notNull().unique(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})
```

### Modify: `Trip` table

Add `ownerId` foreign key → User.id. Existing trips get `ownerId = null` (public, visible to all).

```ts
ownerId: uuid('ownerId').references(() => users.id)
```

### New: `TripShare` table

```ts
pgTable('TripShare', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('tripId').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  userId: uuid('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull().default('view'), // 'view' | 'edit'
  createdAt: timestamp('createdAt').defaultNow().notNull(),
})
```

Unique constraint on `(tripId, userId)`.

### New: `Session` table (connect-pg-simple)

```ts
pgTable('Session', {
  sid: varchar('sid').primaryKey(),
  sess: jsonb('sess').notNull(),
  expire: timestamp('expire').notNull(),
})
```

---

## 2. Backend Changes

### New files

- `backend/src/auth/passport.ts` — Passport config with Google + GitHub strategies
- `backend/src/auth/middleware.ts` — `requireAuth` middleware, `attachUser` (optional)
- `backend/src/routes/authRoutes.ts` — `/auth/*` endpoints
- `backend/src/routes/shareRoutes.ts` — `/api/trips/:id/shares/*` endpoints
- `backend/src/repositories/UserRepository.ts` — findOrCreate by provider+providerId
- `backend/src/repositories/ShareRepository.ts` — share CRUD

### Modified files

- `backend/src/db/schema.ts` — add User, TripShare, Session tables; modify Trip
- `backend/src/app.ts` — add session middleware, passport init, auth routes
- `backend/src/routes/tripRoutes.ts` — protect all trip routes with `requireAuth`
- `backend/src/controllers/tripController.ts` — filter trips by `ownerId` or shared-with user
- `backend/src/repositories/TripRepository.ts` — scope queries to user context

### Auth flow

1. User clicks "Login with Google/GitHub"
2. Frontend navigates to `/auth/google` or `/auth/github`
3. Passport redirects to provider → user authorizes → callback to `/auth/google/callback` or `/auth/github/callback`
4. Passport `deserializeUser` loads user from DB, creates session
5. Session cookie set on response, redirect to `/`

### Protected routes

All `/api/trips` routes require authentication. Ownership check:
- `getAllTrips`: return trips where `ownerId = user.id` OR trip is shared with user
- `getTripById`: return if owner or shared
- `createTrip`: set `ownerId = user.id`
- `updateTrip`/`deleteTrip`: owner only
- `getAllPlaces`: scope to user's accessible trips

### New API endpoints

```
GET  /auth/me                      → current user profile
POST /auth/logout                  → destroy session

GET  /api/trips/:id/shares         → list shares for a trip
POST /api/trips/:id/shares         → invite user { email, permission }
DELETE /api/trips/:id/shares/:userId → remove share

GET  /api/users/search?q=email     → search users by email (for invite autocomplete)
```

---

## 3. Frontend Changes

### New files

- `frontend/src/components/LoginModal.tsx` — Google + GitHub login buttons
- `frontend/src/components/ShareModal.tsx` — invite users, manage permissions
- `frontend/src/components/UserAvatar.tsx` — show user avatar/name in header

### Modified files

- `frontend/src/store/index.ts` — add auth state (`user`, `isAuthenticated`), auth actions (`fetchMe`, `logout`)
- `frontend/src/components/FloatingPanel.tsx` — add share button (owner only)
- `frontend/src/App.tsx` or trip list — show login button when unauthenticated, user avatar when authenticated

### Auth state in Zustand

```ts
interface AuthState {
  user: User | null
  isAuthenticated: boolean
  fetchMe: () => Promise<void>
  logout: () => Promise<void>
}
```

### Login flow (frontend)

1. On app mount, call `GET /auth/me` to check session
2. If not authenticated → show login modal / redirect
3. If authenticated → show user avatar in header, fetch trips scoped to user
4. "Login with Google" / "Login with GitHub" buttons open popup or redirect to `/auth/google` / `/auth/github`

### Share flow (frontend)

1. Owner clicks "Share" on a trip → opens ShareModal
2. Search users by email → select user → choose permission (view/edit)
3. List existing shares with option to remove

---

## 4. Migration & Backward Compatibility

- Existing trips have `ownerId = null` — treat as public during migration
- After migration, null-owner trips are visible to all authenticated users
- Optionally: add a one-time script to assign existing trips to a default user

---

## 5. Security Considerations

- Session cookie: `httpOnly`, `secure` (in production), `sameSite: 'lax'`
- CSRF protection via `sameSite` cookie + Origin header check
- OAuth state parameter validated by Passport
- Share permission checked on every trip access (owner or shared)
- Rate limit `/api/users/search` to prevent enumeration

---

## 6. Dependencies

**Backend:**
- `passport` — auth middleware
- `passport-google-oauth20` — Google strategy
- `passport-github2` — GitHub strategy
- `express-session` — session middleware
- `connect-pg-simple` — PostgreSQL session store

**Frontend:** no new dependencies (axios for API calls, existing UI components)

---

## 7. Environment Variables

Add to `backend/.env`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=...       # random string for session signing
CLIENT_URL=http://localhost:5173  # frontend URL for OAuth redirect
```

---

## Out of Scope

- Email/password registration
- Password reset
- Role-based access beyond view/edit
- OAuth token refresh (handled by Passport)
