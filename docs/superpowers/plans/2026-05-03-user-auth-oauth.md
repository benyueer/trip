# User Authentication & Trip Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OAuth login (Google + GitHub), trip ownership, and user-to-user trip sharing.

**Architecture:** Passport.js handles OAuth flows with express-session backed by PostgreSQL. A new `User` table stores OAuth profiles. `Trip` gets an `ownerId` FK. A `TripShare` join table enables sharing with view/edit permissions. Frontend adds auth state to Zustand, a LoginModal, and a ShareModal.

**Tech Stack:** passport, passport-google-oauth20, passport-github2, express-session, connect-pg-simple (backend). React, Zustand, axios (frontend, no new deps).

---

## File Map

### New files (backend)

| File | Purpose |
|------|---------|
| `backend/src/auth/passport.ts` | Passport strategies (Google + GitHub), serialize/deserialize |
| `backend/src/auth/middleware.ts` | `requireAuth` middleware |
| `backend/src/routes/authRoutes.ts` | `/auth/*` OAuth routes + `/auth/me`, `/auth/logout` |
| `backend/src/routes/shareRoutes.ts` | `/api/trips/:id/shares/*` CRUD |
| `backend/src/routes/userRoutes.ts` | `/api/users/search` |
| `backend/src/repositories/UserRepository.ts` | User CRUD, findOrCreate by provider |
| `backend/src/repositories/ShareRepository.ts` | Share CRUD |

### Modified files (backend)

| File | Changes |
|------|---------|
| `backend/src/db/schema.ts` | Add users, tripShares tables; add ownerId to trips |
| `backend/src/index.ts` | Add session middleware, passport init, new routes |
| `backend/src/routes/tripRoutes.ts` | Wrap all routes with requireAuth |
| `backend/src/controllers/tripController.ts` | Filter trips by user context |
| `backend/src/repositories/TripRepository.ts` | Scope findAll/findById by userId |
| `backend/.env` | Add OAuth env vars |

### New files (frontend)

| File | Purpose |
|------|---------|
| `frontend/src/components/LoginModal.tsx` | Google + GitHub login buttons |
| `frontend/src/components/UserAvatar.tsx` | User avatar/name in header |
| `frontend/src/components/ShareModal.tsx` | Invite users, manage permissions |

### Modified files (frontend)

| File | Changes |
|------|---------|
| `frontend/src/store/index.ts` | Add auth state + actions |
| `frontend/src/pages/PlanningListPage.tsx` | Show login/avatar, auth gate |
| `frontend/src/pages/TripDetailPage.tsx` | Add share button |

---

## Task 1: Install backend dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd backend && pnpm add passport passport-google-oauth20 passport-github2 express-session connect-pg-simple
```

- [ ] **Step 2: Install type packages**

```bash
cd backend && pnpm add -D @types/passport @types/passport-google-oauth20 @types/passport-github2 @types/express-session @types/connect-pg-simple
```

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml
git commit -m "chore(backend): add passport and session dependencies"
```

---

## Task 2: Update database schema

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add users table and update trips table**

Replace the entire content of `backend/src/db/schema.ts`:

```ts
import { pgTable, text, timestamp, integer, jsonb, real, uuid, varchar, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const users = pgTable('User', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatar: text('avatar'),
  provider: text('provider').notNull(),
  providerId: text('providerId').notNull().unique(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

export const trips = pgTable('Trip', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  ownerId: uuid('ownerId').references(() => users.id),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

export const days = pgTable('Day', {
  id: uuid('id').primaryKey().defaultRandom(),
  dayIndex: integer('dayIndex').notNull(),
  tripId: uuid('tripId')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' })
})

export const items = pgTable('Item', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  lngLat: real('lngLat').array().default([]).notNull(),
  distance: text('distance'),
  duration: text('duration'),
  path: jsonb('path'),
  description: text('description'),
  ticket: text('ticket'),
  address: text('address'),
  phone: text('phone'),
  openingHours: text('openingHours'),
  rating: text('rating'),
  category: text('category'),
  notes: text('notes'),
  dayId: uuid('dayId')
    .notNull()
    .references(() => days.id, { onDelete: 'cascade' })
})

export const tripShares = pgTable('TripShare', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('tripId')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull().default('view'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('trip_share_unique').on(t.tripId, t.userId),
])

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ownedTrips: many(trips),
  sharedTrips: many(tripShares),
}))

export const tripsRelations = relations(trips, ({ one, many }) => ({
  owner: one(users, {
    fields: [trips.ownerId],
    references: [users.id],
  }),
  days: many(days),
  shares: many(tripShares),
}))

export const daysRelations = relations(days, ({ one, many }) => ({
  trip: one(trips, {
    fields: [days.tripId],
    references: [trips.id],
  }),
  items: many(items),
}))

export const itemsRelations = relations(items, ({ one }) => ({
  day: one(days, {
    fields: [items.dayId],
    references: [days.id],
  }),
}))

export const tripSharesRelations = relations(tripShares, ({ one }) => ({
  trip: one(trips, {
    fields: [tripShares.tripId],
    references: [trips.id],
  }),
  user: one(users, {
    fields: [tripShares.userId],
    references: [users.id],
  }),
}))
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat(db): add User, TripShare tables and Trip.ownerId"
```

---

## Task 3: Create UserRepository

**Files:**
- Create: `backend/src/repositories/UserRepository.ts`

- [ ] **Step 1: Write UserRepository**

```ts
import { db } from '../db'
import { users } from '../db/schema'
import { eq, ilike, or } from 'drizzle-orm'

export class UserRepository {
  async findOrCreateByProvider(provider: string, providerId: string, profile: {
    email: string
    name: string
    avatar?: string
  }) {
    // Try to find existing user
    const existing = await db.query.users.findFirst({
      where: or(
        eq(users.providerId, providerId),
        eq(users.email, profile.email),
      ),
    })

    if (existing) {
      // Update profile info if changed
      if (existing.name !== profile.name || existing.avatar !== profile.avatar) {
        await db.update(users)
          .set({ name: profile.name, avatar: profile.avatar, updatedAt: new Date() })
          .where(eq(users.id, existing.id))
      }
      return existing
    }

    // Create new user
    const [newUser] = await db.insert(users).values({
      email: profile.email,
      name: profile.name,
      avatar: profile.avatar,
      provider,
      providerId,
    }).returning()

    return newUser
  }

  async findById(id: string) {
    return db.query.users.findFirst({
      where: eq(users.id, id),
    })
  }

  async searchByEmail(query: string, excludeUserId?: string) {
    const results = await db.query.users.findMany({
      where: ilike(users.email, `%${query}%`),
      limit: 10,
    })

    if (excludeUserId) {
      return results.filter(u => u.id !== excludeUserId)
    }
    return results
  }
}

export const userRepository = new UserRepository()
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/UserRepository.ts
git commit -m "feat(backend): add UserRepository"
```

---

## Task 4: Create ShareRepository

**Files:**
- Create: `backend/src/repositories/ShareRepository.ts`

- [ ] **Step 1: Write ShareRepository**

```ts
import { db } from '../db'
import { tripShares } from '../db/schema'
import { eq, and } from 'drizzle-orm'

export class ShareRepository {
  async findByTripId(tripId: string) {
    return db.query.tripShares.findMany({
      where: eq(tripShares.tripId, tripId),
      with: {
        user: true,
      },
    })
  }

  async create(tripId: string, userId: string, permission: string = 'view') {
    const [share] = await db.insert(tripShares).values({
      tripId,
      userId,
      permission,
    }).returning()

    return share
  }

  async delete(tripId: string, userId: string) {
    await db.delete(tripShares)
      .where(
        and(
          eq(tripShares.tripId, tripId),
          eq(tripShares.userId, userId),
        )
      )
  }

  async isSharedWithUser(tripId: string, userId: string) {
    const share = await db.query.tripShares.findFirst({
      where: and(
        eq(tripShares.tripId, tripId),
        eq(tripShares.userId, userId),
      ),
    })
    return share
  }
}

export const shareRepository = new ShareRepository()
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/ShareRepository.ts
git commit -m "feat(backend): add ShareRepository"
```

---

## Task 5: Create Passport configuration

**Files:**
- Create: `backend/src/auth/passport.ts`

- [ ] **Step 1: Write Passport config**

```ts
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as GitHubStrategy } from 'passport-github2'
import { userRepository } from '../repositories/UserRepository'

// Serialize user ID into session
passport.serializeUser((user: any, done) => {
  done(null, user.id)
})

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await userRepository.findById(id)
    done(null, user)
  } catch (err) {
    done(err)
  }
})

// Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const user = await userRepository.findOrCreateByProvider(
        'google',
        profile.id,
        {
          email: profile.emails?.[0]?.value || '',
          name: profile.displayName,
          avatar: profile.photos?.[0]?.value,
        }
      )
      done(null, user)
    } catch (err) {
      done(err as Error)
    }
  }))
}

// GitHub Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: '/auth/github/callback',
  }, async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value || `${profile.username}@github.local`
      const user = await userRepository.findOrCreateByProvider(
        'github',
        profile.id,
        {
          email,
          name: profile.displayName || profile.username,
          avatar: profile.photos?.[0]?.value,
        }
      )
      done(null, user)
    } catch (err) {
      done(err)
    }
  }))
}

export default passport
```

- [ ] **Step 2: Commit**

```bash
mkdir -p backend/src/auth
git add backend/src/auth/passport.ts
git commit -m "feat(backend): add Passport config with Google + GitHub strategies"
```

---

## Task 6: Create auth middleware

**Files:**
- Create: `backend/src/auth/middleware.ts`

- [ ] **Step 1: Write middleware**

```ts
import { Request, Response, NextFunction } from 'express'

declare global {
  namespace Express {
    interface User {
      id: string
      email: string
      name: string
      avatar: string | null
      provider: string
      providerId: string
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next()
  }
  res.status(401).json({ error: 'Authentication required' })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/auth/middleware.ts
git commit -m "feat(backend): add requireAuth middleware"
```

---

## Task 7: Create auth routes

**Files:**
- Create: `backend/src/routes/authRoutes.ts`

- [ ] **Step 1: Write auth routes**

```ts
import { Router } from 'express'
import passport from '../auth/passport'

const router = Router()

// Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user)
  } else {
    res.status(401).json({ error: 'Not authenticated' })
  }
})

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' })
      return
    }
    res.json({ success: true })
  })
})

// Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
}))

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (_req, res) => {
    res.redirect(process.env.CLIENT_URL || '/')
  }
)

// GitHub OAuth
router.get('/github', passport.authenticate('github', {
  scope: ['user:email'],
}))

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (_req, res) => {
    res.redirect(process.env.CLIENT_URL || '/')
  }
)

export default router
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/authRoutes.ts
git commit -m "feat(backend): add auth routes (me, logout, OAuth flows)"
```

---

## Task 8: Create share routes

**Files:**
- Create: `backend/src/routes/shareRoutes.ts`

- [ ] **Step 1: Write share routes**

```ts
import { Router, Request, Response } from 'express'
import { requireAuth } from '../auth/middleware'
import { shareRepository } from '../repositories/ShareRepository'
import { tripRepository } from '../repositories/TripRepository'

const router = Router({ mergeParams: true })

// List shares for a trip
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const shares = await shareRepository.findByTripId(id)
    res.json(shares)
  } catch (error) {
    console.error('Error fetching shares:', error)
    res.status(500).json({ error: 'Failed to fetch shares' })
  }
})

// Add a share (invite user)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { userId, permission } = req.body

    // Verify the requester is the trip owner
    const trip = await tripRepository.findById(id)
    if (!trip || trip.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Only the trip owner can manage shares' })
      return
    }

    // Check if share already exists
    const existing = await shareRepository.isSharedWithUser(id, userId)
    if (existing) {
      res.status(409).json({ error: 'User already has access' })
      return
    }

    const share = await shareRepository.create(id, userId, permission || 'view')
    res.status(201).json(share)
  } catch (error) {
    console.error('Error creating share:', error)
    res.status(500).json({ error: 'Failed to create share' })
  }
})

// Remove a share
router.delete('/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params

    // Verify the requester is the trip owner
    const trip = await tripRepository.findById(id)
    if (!trip || trip.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Only the trip owner can manage shares' })
      return
    }

    await shareRepository.delete(id, userId)
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting share:', error)
    res.status(500).json({ error: 'Failed to delete share' })
  }
})

export default router
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/shareRoutes.ts
git commit -m "feat(backend): add trip sharing routes"
```

---

## Task 9: Create user search route

**Files:**
- Create: `backend/src/routes/userRoutes.ts`

- [ ] **Step 1: Write user search route**

```ts
import { Router, Request, Response } from 'express'
import { requireAuth } from '../auth/middleware'
import { userRepository } from '../repositories/UserRepository'

const router = Router()

// Search users by email
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const { q } = req.query
    if (!q || typeof q !== 'string' || q.length < 2) {
      res.json([])
      return
    }

    const users = await userRepository.searchByEmail(q, req.user!.id)
    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      avatar: u.avatar,
    })))
  } catch (error) {
    console.error('Error searching users:', error)
    res.status(500).json({ error: 'Failed to search users' })
  }
})

export default router
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/userRoutes.ts
git commit -m "feat(backend): add user search route"
```

---

## Task 10: Update backend entry point

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Rewrite index.ts with session + passport + new routes**

```ts
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import pgSession from 'connect-pg-simple'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import passport from './auth/passport'
import tripRoutes from './routes/tripRoutes'
import authRoutes from './routes/authRoutes'
import shareRoutes from './routes/shareRoutes'
import userRoutes from './routes/userRoutes'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Session store
const PgSession = pgSession(session)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '50mb' }))

app.use(session({
  store: new PgSession({
    pool,
    tableName: 'Session',
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}))

// Passport
app.use(passport.initialize())
app.use(passport.session())

// Routes
app.use('/auth', authRoutes)
app.use('/api/trips', tripRoutes)
app.use('/api/trips/:id/shares', shareRoutes)
app.use('/api/users', userRoutes)

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
```

- [ ] **Step 2: Update .env with placeholder values**

Append to `backend/.env`:

```
# OAuth - fill in your own values
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
SESSION_SECRET=change-me-to-a-random-string
CLIENT_URL=http://localhost:5173
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts backend/.env
git commit -m "feat(backend): add session middleware, passport init, new routes"
```

---

## Task 11: Protect trip routes

**Files:**
- Modify: `backend/src/routes/tripRoutes.ts`

- [ ] **Step 1: Add requireAuth to all trip routes**

```ts
import { Router } from 'express'
import * as tripController from '../controllers/tripController'
import { requireAuth } from '../auth/middleware'

const router = Router()

router.use(requireAuth)

router.get('/', tripController.getAllTrips)
router.get('/places', tripController.getAllPlaces)
router.get('/:id', tripController.getTripById)
router.post('/', tripController.createTrip)
router.put('/:id', tripController.updateTrip)
router.delete('/:id', tripController.deleteTrip)
router.post('/:id/days/:dayIndex/routes', tripController.calculateAndAddRoute)

export default router
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/tripRoutes.ts
git commit -m "feat(backend): protect all trip routes with requireAuth"
```

---

## Task 12: Update TripRepository for user scoping

**Files:**
- Modify: `backend/src/repositories/TripRepository.ts`

- [ ] **Step 1: Add user-scoped queries to TripRepository**

Replace the entire `TripRepository`:

```ts
import { db } from '../db'
import { trips, days, items, tripShares } from '../db/schema'
import { eq, desc, asc, or, and } from 'drizzle-orm'

export class TripRepository {
  async findAllForUser(userId: string) {
    return db.query.trips.findMany({
      where: or(
        eq(trips.ownerId, userId),
        // Trips shared with this user
        eq(trips.id, db.select({ tripId: tripShares.tripId })
          .from(tripShares)
          .where(eq(tripShares.userId, userId))
          .limit(1)
        ),
      ),
      with: {
        days: {
          with: {
            items: true,
          },
          orderBy: [asc(days.dayIndex)],
        },
        owner: true,
      },
      orderBy: [desc(trips.updatedAt)],
    })
  }

  async findById(id: string) {
    return db.query.trips.findFirst({
      where: eq(trips.id, id),
      with: {
        days: {
          with: {
            items: true,
          },
          orderBy: [asc(days.dayIndex)],
        },
        owner: true,
      },
    })
  }

  async canUserAccess(tripId: string, userId: string): Promise<boolean> {
    const trip = await this.findById(tripId)
    if (!trip) return false
    if (trip.ownerId === userId) return true

    const share = await db.query.tripShares.findFirst({
      where: and(
        eq(tripShares.tripId, tripId),
        eq(tripShares.userId, userId),
      ),
    })
    return !!share
  }

  async isOwner(tripId: string, userId: string): Promise<boolean> {
    const trip = await this.findById(tripId)
    return trip?.ownerId === userId
  }

  async create(data: any, ownerId?: string) {
    return db.transaction(async (tx) => {
      const [newTrip] = await tx.insert(trips).values({
        title: data.title,
        ownerId: ownerId || null,
      }).returning()

      if (data.days && Array.isArray(data.days)) {
        for (const dayData of data.days) {
          const [newDay] = await tx.insert(days).values({
            dayIndex: dayData.dayIndex,
            tripId: newTrip.id,
          }).returning()

          if (dayData.items && dayData.items.length > 0) {
            await tx.insert(items).values(
              dayData.items.map((item: any) => ({
                id: item.id,
                type: item.type,
                name: item.name,
                lngLat: item.lngLat || [],
                distance: item.distance,
                duration: item.duration,
                path: item.path,
                description: item.description,
                ticket: item.ticket,
                address: item.address,
                phone: item.phone,
                openingHours: item.openingHours,
                rating: item.rating,
                category: item.category,
                notes: item.notes,
                dayId: newDay.id,
              }))
            )
          }
        }
      }

      return tx.query.trips.findFirst({
        where: eq(trips.id, newTrip.id),
        with: {
          days: {
            with: {
              items: true,
            },
            orderBy: [asc(days.dayIndex)],
          },
          owner: true,
        },
      })
    })
  }

  async update(id: string, data: any) {
    return db.transaction(async (tx) => {
      await tx.update(trips)
        .set({ title: data.title, updatedAt: new Date() })
        .where(eq(trips.id, id))

      await tx.delete(days).where(eq(days.tripId, id))

      if (data.days && Array.isArray(data.days)) {
        for (const dayData of data.days) {
          const [newDay] = await tx.insert(days).values({
            dayIndex: dayData.dayIndex,
            tripId: id,
          }).returning()

          if (dayData.items && dayData.items.length > 0) {
            await tx.insert(items).values(
              dayData.items.map((item: any) => ({
                id: item.id,
                type: item.type,
                name: item.name,
                lngLat: item.lngLat || [],
                distance: item.distance,
                duration: item.duration,
                path: item.path,
                description: item.description,
                ticket: item.ticket,
                address: item.address,
                phone: item.phone,
                openingHours: item.openingHours,
                rating: item.rating,
                category: item.category,
                notes: item.notes,
                dayId: newDay.id,
              }))
            )
          }
        }
      }

      return tx.query.trips.findFirst({
        where: eq(trips.id, id),
        with: {
          days: {
            with: {
              items: true,
            },
            orderBy: [asc(days.dayIndex)],
          },
          owner: true,
        },
      })
    })
  }

  async delete(id: string) {
    const [deletedTrip] = await db.delete(trips)
      .where(eq(trips.id, id))
      .returning()
    return deletedTrip
  }

  async findAllPlacesForUser(userId: string) {
    return db.query.items.findMany({
      where: eq(items.type, 'place'),
      with: {
        day: {
          with: {
            trip: true,
          },
        },
      },
    })
  }
}

export const tripRepository = new TripRepository()
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/TripRepository.ts
git commit -m "feat(backend): scope TripRepository queries by user"
```

---

## Task 13: Update trip controller for user context

**Files:**
- Modify: `backend/src/controllers/tripController.ts`

- [ ] **Step 1: Update controller to use user-scoped queries**

```ts
import { Request, Response } from 'express'
import { tripRepository } from '../repositories/TripRepository'

export const getAllTrips = async (req: Request, res: Response) => {
  try {
    const trips = await tripRepository.findAllForUser(req.user!.id)
    res.json(trips)
  } catch (error) {
    console.error('Error fetching trips:', error)
    res.status(500).json({ error: 'Failed to fetch trips' })
  }
}

export const getTripById = async (req: Request, res: Response) => {
  try {
    const trip = await tripRepository.findById(req.params.id)
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' })
      return
    }

    // Check access
    const hasAccess = await tripRepository.canUserAccess(req.params.id, req.user!.id)
    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    res.json(trip)
  } catch (error) {
    console.error('Error fetching trip:', error)
    res.status(500).json({ error: 'Failed to fetch trip' })
  }
}

export const createTrip = async (req: Request, res: Response) => {
  try {
    const newTrip = await tripRepository.create(req.body, req.user!.id)
    res.status(201).json(newTrip)
  } catch (error) {
    console.error('Error creating trip:', error)
    res.status(500).json({ error: 'Failed to create trip' })
  }
}

export const updateTrip = async (req: Request, res: Response) => {
  try {
    const isOwner = await tripRepository.isOwner(req.params.id, req.user!.id)
    if (!isOwner) {
      res.status(403).json({ error: 'Only the owner can update this trip' })
      return
    }

    const updatedTrip = await tripRepository.update(req.params.id, req.body)
    res.json(updatedTrip)
  } catch (error) {
    console.error('Error updating trip:', error)
    res.status(500).json({ error: 'Failed to update trip' })
  }
}

export const deleteTrip = async (req: Request, res: Response) => {
  try {
    const isOwner = await tripRepository.isOwner(req.params.id, req.user!.id)
    if (!isOwner) {
      res.status(403).json({ error: 'Only the owner can delete this trip' })
      return
    }

    await tripRepository.delete(req.params.id)
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting trip:', error)
    res.status(500).json({ error: 'Failed to delete trip' })
  }
}

export const getAllPlaces = async (req: Request, res: Response) => {
  try {
    const places = await tripRepository.findAllPlacesForUser(req.user!.id)
    const result = places.map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      lngLat: p.lngLat as [number, number],
      description: p.description,
      ticket: p.ticket,
      address: p.address,
      phone: p.phone,
      openingHours: p.openingHours,
      rating: p.rating,
      category: p.category,
      notes: p.notes,
      tripId: p.day.trip.id,
      tripTitle: p.day.trip.title,
    }))
    res.json(result)
  } catch (error) {
    console.error('Error fetching all places:', error)
    res.status(500).json({ error: 'Failed to fetch places' })
  }
}

export const calculateAndAddRoute = async (req: Request, res: Response) => {
  try {
    const { id, dayIndex } = req.params
    const { startLngLat, endLngLat, mode, name, routeId } = req.body

    if (!startLngLat || !endLngLat || !mode) {
      res.status(400).json({ error: 'Missing required routing parameters' })
      return
    }

    const key = process.env.AMAP_WEB_KEY
    if (!key) {
      res.status(500).json({ error: 'AMAP_WEB_KEY is not configured on server' })
      return
    }

    const origin = `${startLngLat[0]},${startLngLat[1]}`
    const destination = `${endLngLat[0]},${endLngLat[1]}`

    let apiUrl = ''
    if (mode === 'Driving') {
      apiUrl = `https://restapi.amap.com/v3/direction/driving?origin=${origin}&destination=${destination}&key=${key}`
    } else if (mode === 'Walking') {
      apiUrl = `https://restapi.amap.com/v3/direction/walking?origin=${origin}&destination=${destination}&key=${key}`
    } else if (mode === 'Riding') {
      apiUrl = `https://restapi.amap.com/v4/direction/bicycling?origin=${origin}&destination=${destination}&key=${key}`
    } else {
      res.status(400).json({ error: 'Unsupported routing mode' })
      return
    }

    const response = await fetch(apiUrl)
    const result = await response.json()

    let distanceText = '未知'
    let durationText = ''
    const path: [number, number][] = []

    if (mode === 'Riding') {
      if (result.errcode !== 0) {
        throw new Error(`AMap API Error: ${result.errmsg}`)
      }
      const route = result.data.paths[0]
      distanceText = route.distance ? (parseInt(route.distance) / 1000).toFixed(1) + ' km' : '未知'
      if (route.duration) {
        const mins = Math.round(parseInt(route.duration) / 60)
        durationText = mins < 60 ? `${mins} 分钟` : `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟`
      }
      if (route.steps) {
        route.steps.forEach((step: any) => {
          if (step.polyline) {
            const points = step.polyline.split(';')
            points.forEach((pt: string) => {
              const [lng, lat] = pt.split(',').map(Number)
              path.push([lng, lat])
            })
          }
        })
      }
    } else {
      if (result.status !== '1') {
        throw new Error(`AMap API Error: ${result.info}`)
      }
      const route = result.route.paths[0]
      distanceText = route.distance ? (parseInt(route.distance) / 1000).toFixed(1) + ' km' : '未知'
      if (route.duration) {
        const mins = Math.round(parseInt(route.duration) / 60)
        durationText = mins < 60 ? `${mins} 分钟` : `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟`
      }
      if (route.steps) {
        route.steps.forEach((step: any) => {
          if (step.polyline) {
            const points = step.polyline.split(';')
            points.forEach((pt: string) => {
              const [lng, lat] = pt.split(',').map(Number)
              path.push([lng, lat])
            })
          }
        })
      }
    }

    const newRoute = {
      id: routeId,
      type: 'route',
      name: name,
      distance: distanceText,
      duration: durationText,
      path: path,
    }

    const trip = await tripRepository.findById(id)
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' })
      return
    }

    let day = trip.days.find(d => d.dayIndex === Number(dayIndex))
    if (!day) {
      day = { id: crypto.randomUUID(), dayIndex: Number(dayIndex), tripId: trip.id, items: [] } as any
      trip.days.push(day as any)
    }

    day.items.push(newRoute as any)

    const updatedTrip = await tripRepository.update(id, trip)
    res.json(updatedTrip)
  } catch (error) {
    console.error('Error calculating route:', error)
    res.status(500).json({ error: 'Failed to calculate route' })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/controllers/tripController.ts
git commit -m "feat(backend): update trip controller with user scoping"
```

---

## Task 13.5: Push schema to database

**Files:** none

- [ ] **Step 1: Push schema changes to DB**

```bash
pnpm --filter backend db:push
```

This creates the `User`, `TripShare`, and `Session` tables, and adds `ownerId` to the `Trip` table.

- [ ] **Step 2: Verify tables exist**

```bash
pnpm --filter backend db:studio
```

Confirm `User`, `TripShare`, `Session` tables exist. Close studio after verification.

---

## Task 14: Frontend - Add auth state to Zustand store

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add User type and auth state to store**

Add these types and state at the top of the file (after the existing `CachedPlace` interface):

```ts
export interface User {
  id: string
  email: string
  name: string
  avatar: string | null
  provider: string
}

export interface Share {
  id: string
  tripId: string
  userId: string
  permission: string
  createdAt: string
  user: User
}
```

Add these fields to the `TripState` interface:

```ts
  // Auth
  user: User | null
  isAuthenticated: boolean
  authChecked: boolean
```

Add these actions to the `TripState` interface:

```ts
  fetchMe: () => Promise<void>
  logout: () => Promise<void>
```

- [ ] **Step 2: Add auth state and actions to the store implementation**

Add to the store initial state (after `showAllPlaces: false`):

```ts
  user: null,
  isAuthenticated: false,
  authChecked: false,
```

Add the action implementations (after `setRoutingEnd`):

```ts
  fetchMe: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL.replace('/api', '')}/auth/me`, {
        withCredentials: true,
      })
      set({ user: response.data, isAuthenticated: true, authChecked: true })
    } catch {
      set({ user: null, isAuthenticated: false, authChecked: true })
    }
  },

  logout: async () => {
    try {
      await axios.post(`${API_BASE_URL.replace('/api', '')}/auth/logout`, {}, {
        withCredentials: true,
      })
    } catch {
      // Ignore errors on logout
    }
    set({ user: null, isAuthenticated: false, currentTrip: null, trips: [] })
  },
```

- [ ] **Step 3: Update fetchTrips and fetchTripById to use credentials**

In the `fetchTrips` action, add `{ withCredentials: true }` to the axios call:

```ts
  fetchTrips: async () => {
    set({ loading: true })
    try {
      const response = await axios.get(`${API_BASE_URL}/trips`, { withCredentials: true })
      set({ trips: response.data, loading: false })
    } catch (error) {
      console.error('Failed to fetch trips:', error)
      set({ loading: false })
    }
  },
```

In `fetchTripById`:

```ts
  fetchTripById: async (id) => {
    set({ loading: true })
    try {
      const response = await axios.get(`${API_BASE_URL}/trips/${id}`, { withCredentials: true })
      set({ currentTrip: response.data, loading: false, activeDayIndex: 1 })
    } catch (error) {
      console.error('Failed to fetch trip:', error)
      set({ loading: false })
    }
  },
```

In `createTrip`:

```ts
  createTrip: async (title) => {
    try {
      await axios.post(`${API_BASE_URL}/trips`, { title }, { withCredentials: true })
      get().fetchTrips()
    } catch (error) {
      console.error('Failed to create trip:', error)
    }
  },
```

In `deleteTrip`:

```ts
  deleteTrip: async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/trips/${id}`, { withCredentials: true })
      get().fetchTrips()
    } catch (error) {
      console.error('Failed to delete trip:', error)
    }
  },
```

In `updateCurrentTrip`:

```ts
  updateCurrentTrip: async (data) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    try {
      const response = await axios.put(`${API_BASE_URL}/trips/${currentTrip.id}`, {
        ...currentTrip,
        ...data,
      }, { withCredentials: true })
      set({ currentTrip: response.data, allPlacesCache: null, allPlacesCacheTime: 0 })
    } catch (error) {
      console.error('Failed to update trip:', error)
    }
  },
```

In `fetchAllPlaces`:

```ts
  fetchAllPlaces: async () => {
    const { allPlacesCache, allPlacesCacheTime } = get()
    const now = Date.now()
    if (allPlacesCache && allPlacesCacheTime && now - allPlacesCacheTime < 5 * 60 * 1000) {
      return
    }
    set({ allPlacesLoading: true })
    try {
      const response = await axios.get(`${API_BASE_URL}/trips/places`, { withCredentials: true })
      set({ allPlacesCache: response.data, allPlacesCacheTime: now, allPlacesLoading: false })
    } catch (error) {
      console.error('Failed to fetch all places:', error)
      set({ allPlacesLoading: false })
    }
  },
```

In `calculateAndAddRoute`:

```ts
  calculateAndAddRoute: async (dayIndex: number, startPlace: Place, endPlace: Place, mode: string) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    set({ loading: true })
    try {
      const modeName = mode === 'Driving' ? '驾车' : mode === 'Walking' ? '步行' : '骑行'
      const name = `${startPlace.name} 到 ${endPlace.name} (${modeName})`

      const response = await axios.post(`${API_BASE_URL}/trips/${currentTrip.id}/days/${dayIndex}/routes`, {
        routeId: crypto.randomUUID(),
        startLngLat: startPlace.lngLat,
        endLngLat: endPlace.lngLat,
        mode,
        name,
      }, { withCredentials: true })

      set({ currentTrip: response.data, loading: false })
      get().cancelRouting()
    } catch (error) {
      console.error('Failed to calculate and add route:', error)
      alert('无法规划路线，请重试')
      set({ loading: false })
    }
  },
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat(frontend): add auth state and withCredentials to all API calls"
```

---

## Task 15: Frontend - Create LoginModal

**Files:**
- Create: `frontend/src/components/LoginModal.tsx`

- [ ] **Step 1: Write LoginModal component**

```tsx
import React from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const LoginModal: React.FC = () => {
  const handleLogin = (provider: 'google' | 'github') => {
    window.location.href = `${API_BASE}/auth/${provider}`
  }

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50'>
      <div className='bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md mx-4 text-center'>
        <h2 className='text-2xl font-bold text-gray-900 mb-2'>欢迎回来</h2>
        <p className='text-gray-500 mb-8'>登录以管理你的行程</p>

        <div className='space-y-4'>
          <button
            onClick={() => handleLogin('google')}
            className='w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-semibold py-3.5 px-6 rounded-xl transition-all hover:shadow-md active:scale-[0.98]'
          >
            <svg className='w-5 h-5' viewBox='0 0 24 24'>
              <path fill='#4285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z' />
              <path fill='#34A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z' />
              <path fill='#FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z' />
              <path fill='#EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z' />
            </svg>
            使用 Google 账号登录
          </button>

          <button
            onClick={() => handleLogin('github')}
            className='w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3.5 px-6 rounded-xl transition-all hover:shadow-md active:scale-[0.98]'
          >
            <svg className='w-5 h-5' fill='white' viewBox='0 0 24 24'>
              <path d='M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z' />
            </svg>
            使用 GitHub 账号登录
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoginModal
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LoginModal.tsx
git commit -m "feat(frontend): add LoginModal with Google and GitHub buttons"
```

---

## Task 16: Frontend - Create UserAvatar

**Files:**
- Create: `frontend/src/components/UserAvatar.tsx`

- [ ] **Step 1: Write UserAvatar component**

```tsx
import React, { useState } from 'react'
import { useTripStore } from '../store'
import { LogOut, ChevronDown } from 'lucide-react'

const UserAvatar: React.FC = () => {
  const { user, logout } = useTripStore()
  const [showMenu, setShowMenu] = useState(false)

  if (!user) return null

  return (
    <div className='relative'>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className='flex items-center gap-2 bg-white/80 backdrop-blur-md px-3 py-2 rounded-xl shadow-sm border border-gray-100 hover:bg-white transition-all'
      >
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} className='w-8 h-8 rounded-full object-cover' />
        ) : (
          <div className='w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm'>
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className='text-sm font-medium text-gray-700 hidden sm:block'>{user.name}</span>
        <ChevronDown size={14} className='text-gray-400' />
      </button>

      {showMenu && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => setShowMenu(false)} />
          <div className='absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50'>
            <div className='px-4 py-2 border-b border-gray-100'>
              <p className='text-sm font-medium text-gray-900'>{user.name}</p>
              <p className='text-xs text-gray-500'>{user.email}</p>
            </div>
            <button
              onClick={() => {
                setShowMenu(false)
                logout()
              }}
              className='w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors'
            >
              <LogOut size={16} />
              退出登录
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default UserAvatar
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/UserAvatar.tsx
git commit -m "feat(frontend): add UserAvatar with dropdown menu"
```

---

## Task 17: Frontend - Create ShareModal

**Files:**
- Create: `frontend/src/components/ShareModal.tsx`

- [ ] **Step 1: Write ShareModal component**

```tsx
import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { X, UserPlus, Trash2, Search } from 'lucide-react'
import { useTripStore } from '../store'

const API_BASE_URL = 'http://localhost:3001/api'

interface ShareUser {
  id: string
  email: string
  name: string
  avatar: string | null
}

interface ExistingShare {
  id: string
  userId: string
  permission: string
  user: ShareUser
}

interface ShareModalProps {
  tripId: string
  isOpen: boolean
  onClose: () => void
}

const ShareModal: React.FC<ShareModalProps> = ({ tripId, isOpen, onClose }) => {
  const [shares, setShares] = useState<ExistingShare[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ShareUser[]>([])
  const [selectedUser, setSelectedUser] = useState<ShareUser | null>(null)
  const [permission, setPermission] = useState('view')
  const [loading, setLoading] = useState(false)

  const fetchShares = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/trips/${tripId}/shares`, { withCredentials: true })
      setShares(res.data)
    } catch (error) {
      console.error('Failed to fetch shares:', error)
    }
  }, [tripId])

  useEffect(() => {
    if (isOpen) {
      fetchShares()
      setSearchQuery('')
      setSearchResults([])
      setSelectedUser(null)
    }
  }, [isOpen, fetchShares])

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/users/search?q=${searchQuery}`, { withCredentials: true })
        setSearchResults(res.data)
      } catch (error) {
        console.error('Failed to search users:', error)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleInvite = async () => {
    if (!selectedUser) return
    setLoading(true)
    try {
      await axios.post(`${API_BASE_URL}/trips/${tripId}/shares`, {
        userId: selectedUser.id,
        permission,
      }, { withCredentials: true })
      setSelectedUser(null)
      setSearchQuery('')
      setSearchResults([])
      fetchShares()
    } catch (error: any) {
      alert(error.response?.data?.error || '邀请失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (userId: string) => {
    try {
      await axios.delete(`${API_BASE_URL}/trips/${tripId}/shares/${userId}`, { withCredentials: true })
      fetchShares()
    } catch (error) {
      console.error('Failed to remove share:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50'>
      <div className='bg-white rounded-3xl shadow-2xl p-8 w-full max-w-lg mx-4'>
        <div className='flex justify-between items-center mb-6'>
          <h2 className='text-xl font-bold text-gray-900'>分享行程</h2>
          <button onClick={onClose} className='p-2 hover:bg-gray-100 rounded-lg transition-colors'>
            <X size={20} />
          </button>
        </div>

        {/* Search and invite */}
        <div className='mb-6'>
          <div className='relative'>
            <Search size={18} className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400' />
            <input
              type='text'
              value={selectedUser ? selectedUser.email : searchQuery}
              onChange={(e) => {
                setSelectedUser(null)
                setSearchQuery(e.target.value)
              }}
              placeholder='搜索邮箱来邀请用户...'
              disabled={!!selectedUser}
              className='w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all disabled:opacity-50'
            />
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && !selectedUser && (
            <div className='mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto'>
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => {
                    setSelectedUser(user)
                    setSearchResults([])
                  }}
                  className='w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left'
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className='w-8 h-8 rounded-full' />
                  ) : (
                    <div className='w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold'>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className='text-sm font-medium text-gray-900'>{user.name}</p>
                    <p className='text-xs text-gray-500'>{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Permission selector and invite button */}
          {selectedUser && (
            <div className='mt-3 flex items-center gap-3'>
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value)}
                className='px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none'
              >
                <option value='view'>仅查看</option>
                <option value='edit'>可编辑</option>
              </select>
              <button
                onClick={handleInvite}
                disabled={loading}
                className='flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50'
              >
                <UserPlus size={16} />
                {loading ? '邀请中...' : '邀请'}
              </button>
              <button
                onClick={() => {
                  setSelectedUser(null)
                  setSearchQuery('')
                }}
                className='text-sm text-gray-500 hover:text-gray-700'
              >
                取消
              </button>
            </div>
          )}
        </div>

        {/* Existing shares */}
        <div>
          <h3 className='text-sm font-medium text-gray-500 mb-3'>已分享给</h3>
          {shares.length === 0 ? (
            <p className='text-sm text-gray-400'>暂无分享</p>
          ) : (
            <div className='space-y-2'>
              {shares.map((share) => (
                <div key={share.id} className='flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg'>
                  <div className='flex items-center gap-3'>
                    {share.user.avatar ? (
                      <img src={share.user.avatar} alt={share.user.name} className='w-8 h-8 rounded-full' />
                    ) : (
                      <div className='w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold'>
                        {share.user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className='text-sm font-medium text-gray-900'>{share.user.name}</p>
                      <p className='text-xs text-gray-500'>{share.user.email}</p>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='text-xs text-gray-400'>
                      {share.permission === 'edit' ? '可编辑' : '仅查看'}
                    </span>
                    <button
                      onClick={() => handleRemove(share.userId)}
                      className='p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors'
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ShareModal
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ShareModal.tsx
git commit -m "feat(frontend): add ShareModal for trip sharing"
```

---

## Task 18: Frontend - Update pages for auth integration

**Files:**
- Modify: `frontend/src/pages/PlanningListPage.tsx`
- Modify: `frontend/src/pages/TripDetailPage.tsx`

- [ ] **Step 1: Update PlanningListPage with auth gate**

Add imports at top:

```tsx
import React, { useEffect, useState } from 'react'
import { useTripStore } from '../store'
import { Plus, Trash2, Calendar, ChevronRight, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import LoginModal from '../components/LoginModal'
import UserAvatar from '../components/UserAvatar'
```

Replace the component body:

```tsx
const PlanningListPage: React.FC = () => {
  const { trips, fetchTrips, createTrip, deleteTrip, loading, user, isAuthenticated, authChecked, fetchMe } = useTripStore()
  const [newTripTitle, setNewTripTitle] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    fetchMe()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchTrips()
    }
  }, [isAuthenticated])

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <Loader2 className='animate-spin text-gray-400' size={40} />
      </div>
    )
  }

  // Show login modal if not authenticated
  if (!isAuthenticated) {
    return <LoginModal />
  }

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTripTitle.trim()) return
    await createTrip(newTripTitle)
    setNewTripTitle('')
    setIsAdding(false)
  }

  return (
    <div className='min-h-screen bg-gray-50 p-8'>
      <div className='max-w-4xl mx-auto'>
        <header className='flex justify-between items-center mb-12'>
          <div>
            <h1 className='text-4xl font-bold text-gray-900 mb-2'>行程规划</h1>
            <p className='text-gray-500'>探索世界，从一个完美的计划开始。</p>
          </div>
          <div className='flex items-center gap-4'>
            <UserAvatar />
            <button
              onClick={() => setIsAdding(true)}
              className='flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-200 active:scale-95'
            >
              <Plus size={20} />
              新建行程
            </button>
          </div>
        </header>

        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className='bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8'
            >
              <form onSubmit={handleCreateTrip} className='flex gap-4'>
                <input
                  autoFocus
                  type='text'
                  value={newTripTitle}
                  onChange={(e) => setNewTripTitle(e.target.value)}
                  placeholder='输入行程名称，例如：京都赏樱之旅'
                  className='flex-1 px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all outline-none'
                />
                <button
                  type='submit'
                  className='bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-all'
                >
                  确认创建
                </button>
                <button
                  type='button'
                  onClick={() => setIsAdding(false)}
                  className='px-6 py-3 text-gray-500 hover:text-gray-700 font-semibold'
                >
                  取消
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className='flex flex-col items-center justify-center py-20 text-gray-400'>
            <Loader2 className='animate-spin mb-4' size={40} />
            <p>加载行程中...</p>
          </div>
        ) : (
          <div className='grid gap-6'>
            {trips.length === 0 ? (
              <div className='text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100'>
                <p className='text-gray-400 mb-4'>还没有任何行程</p>
                <button
                  onClick={() => setIsAdding(true)}
                  className='text-blue-600 font-semibold hover:underline'
                >
                  立即创建一个吧
                </button>
              </div>
            ) : (
              trips.map((trip) => (
                <motion.div
                  layout
                  key={trip.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className='group relative bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100'
                >
                  <div className='flex justify-between items-center'>
                    <Link to={`/trip/${trip.id}`} className='flex-1 flex items-center gap-6'>
                      <div className='w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors'>
                        <Calendar size={32} />
                      </div>
                      <div>
                        <h3 className='text-xl font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors'>
                          {trip.title}
                        </h3>
                        <p className='text-sm text-gray-400 flex items-center gap-1'>
                          创建于 {new Date(trip.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </Link>
                    <div className='flex items-center gap-4'>
                      <button
                        onClick={() => deleteTrip(trip.id)}
                        className='p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all rounded-xl'
                      >
                        <Trash2 size={20} />
                      </button>
                      <Link
                        to={`/trip/${trip.id}`}
                        className='p-3 text-gray-300 group-hover:text-blue-600 transition-all'
                      >
                        <ChevronRight size={24} />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PlanningListPage
```

- [ ] **Step 2: Update TripDetailPage with share button**

Add imports:

```tsx
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTripStore } from '../store'
import MapContainer from '../components/MapContainer'
import FloatingPanel from '../components/FloatingPanel'
import PlaceModal from '../components/PlaceModal'
import ShareModal from '../components/ShareModal'
import { ArrowLeft, Loader2, Share2 } from 'lucide-react'
```

Add state for share modal in the component:

```tsx
const TripDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fetchTripById, currentTrip, loading, user } = useTripStore()
  const [showShareModal, setShowShareModal] = useState(false)

  useEffect(() => {
    if (id) {
      fetchTripById(id)
    }
  }, [id])

  const isOwner = currentTrip && user && (currentTrip as any).ownerId === user.id
```

Add share button in the header area, after the back button:

```tsx
  return (
    <div className='w-screen h-screen relative overflow-hidden bg-gray-50 font-sans'>
      <button
        onClick={() => navigate('/')}
        className='absolute top-6 left-6 z-10 bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white hover:bg-white transition-all active:scale-95 flex items-center justify-center text-gray-700'
      >
        <ArrowLeft size={24} />
      </button>

      {isOwner && (
        <button
          onClick={() => setShowShareModal(true)}
          className='absolute top-6 right-6 z-10 bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white hover:bg-white transition-all active:scale-95 flex items-center justify-center text-gray-700'
        >
          <Share2 size={24} />
        </button>
      )}

      <MapContainer />
      <FloatingPanel />
      <PlaceModal />
      <ShareModal
        tripId={id!}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />

      <div className='absolute top-6 left-24 z-10 bg-white/80 backdrop-blur-md px-6 py-3 rounded-2xl shadow-lg border border-white'>
        <h1 className='text-lg font-bold text-gray-900'>{currentTrip.title}</h1>
      </div>
    </div>
  )
}

export default TripDetailPage
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PlanningListPage.tsx frontend/src/pages/TripDetailPage.tsx
git commit -m "feat(frontend): integrate auth into pages with LoginModal and ShareModal"
```

---

## Task 19: Final verification

- [ ] **Step 1: Start the dev servers**

```bash
pnpm dev:all
```

- [ ] **Step 2: Verify backend starts without errors**

Check terminal output for "Server is running on port 3001".

- [ ] **Step 3: Verify frontend starts without errors**

Check terminal output for Vite dev server URL.

- [ ] **Step 4: Test auth flow**

1. Open `http://localhost:5173` — should show login modal
2. Click "Login with Google" or "Login with GitHub"
3. After OAuth, should redirect back and show trip list
4. Click avatar dropdown → "退出登录" → should return to login modal

- [ ] **Step 5: Test trip ownership**

1. Login → create a trip → verify it appears in list
2. Check DB: trip should have `ownerId` set

- [ ] **Step 6: Test sharing (requires two user accounts)**

1. Login as User A → create trip → click Share button
2. Search for User B by email → invite with "仅查看"
3. Login as User B → verify shared trip appears in list
4. User B should NOT see delete button on shared trip

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete user auth system with OAuth and trip sharing"
```
