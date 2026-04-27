import { pgTable, text, timestamp, integer, jsonb, real, uuid } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const trips = pgTable('Trip', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull()
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
  type: text('type').notNull(), // 'place' or 'route'
  name: text('name').notNull(),
  lngLat: real('lngLat').array().default([]).notNull(),
  distance: text('distance'),
  path: jsonb('path'), // Store path as JSON [[lng, lat], ...]
  description: text('description'),
  ticket: text('ticket'),  // 门票价格
  dayId: uuid('dayId')
    .notNull()
    .references(() => days.id, { onDelete: 'cascade' })
})

// 定义关系
export const tripsRelations = relations(trips, ({ many }) => ({
  days: many(days)
}))

export const daysRelations = relations(days, ({ one, many }) => ({
  trip: one(trips, {
    fields: [days.tripId],
    references: [trips.id]
  }),
  items: many(items)
}))

export const itemsRelations = relations(items, ({ one }) => ({
  day: one(days, {
    fields: [items.dayId],
    references: [days.id]
  })
}))
