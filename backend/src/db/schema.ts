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
  description: text('description').default(''),
  ownerId: uuid('ownerId').references(() => users.id),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

export const days = pgTable('Day', {
  id: uuid('id').primaryKey().defaultRandom(),
  dayIndex: integer('dayIndex').notNull(),
  description: text('description').default(''),
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

// --- Agent Tables ---

export const agentSessions = pgTable('AgentSession', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

export const agentMessages = pgTable('AgentMessage', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('sessionId')
    .notNull()
    .references(() => agentSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
})

export const userMemories = pgTable('UserMemory', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  category: text('category').notNull().default('preference'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ownedTrips: many(trips),
  sharedTrips: many(tripShares),
  agentSessions: many(agentSessions),
  memories: many(userMemories),
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

export const agentSessionsRelations = relations(agentSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [agentSessions.userId],
    references: [users.id],
  }),
  messages: many(agentMessages),
}))

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  session: one(agentSessions, {
    fields: [agentMessages.sessionId],
    references: [agentSessions.id],
  }),
}))

export const userMemoriesRelations = relations(userMemories, ({ one }) => ({
  user: one(users, {
    fields: [userMemories.userId],
    references: [users.id],
  }),
}))
