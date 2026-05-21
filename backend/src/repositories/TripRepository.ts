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
        description: data.description || '',
        ownerId: ownerId || null,
      }).returning()

      if (data.days && Array.isArray(data.days)) {
        for (const dayData of data.days) {
          const [newDay] = await tx.insert(days).values({
            dayIndex: dayData.dayIndex,
            description: dayData.description || '',
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
        .set({ title: data.title, description: data.description || '', updatedAt: new Date() })
        .where(eq(trips.id, id))

      await tx.delete(days).where(eq(days.tripId, id))

      if (data.days && Array.isArray(data.days)) {
        for (const dayData of data.days) {
          const [newDay] = await tx.insert(days).values({
            dayIndex: dayData.dayIndex,
            description: dayData.description || '',
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
