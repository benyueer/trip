import { db } from '../db'
import { trips, days, items } from '../db/schema'
import { eq, desc, asc } from 'drizzle-orm'

export class TripRepository {
  async findAll() {
    return db.query.trips.findMany({
      with: {
        days: {
          with: {
            items: true
          },
          orderBy: [asc(days.dayIndex)]
        }
      },
      orderBy: [desc(trips.updatedAt)]
    })
  }

  async findById(id: string) {
    return db.query.trips.findFirst({
      where: eq(trips.id, id),
      with: {
        days: {
          with: {
            items: true
          },
          orderBy: [asc(days.dayIndex)]
        }
      }
    })
  }

  async create(data: any) {
    return db.transaction(async (tx) => {
      // 1. 创建 Trip
      const [newTrip] = await tx.insert(trips).values({
        title: data.title
      }).returning()

      // 2. 创建 Days 和 Items
      if (data.days && Array.isArray(data.days)) {
        for (const dayData of data.days) {
          const [newDay] = await tx.insert(days).values({
            dayIndex: dayData.dayIndex,
            tripId: newTrip.id
          }).returning()

          if (dayData.items && dayData.items.length > 0) {
            await tx.insert(items).values(
              dayData.items.map((item: any) => ({
                id: item.id,
                type: item.type,
                name: item.name,
                lngLat: item.lngLat || [],
                distance: item.distance,
                path: item.path,
                description: item.description,
                ticket: item.ticket,
                dayId: newDay.id
              }))
            )
          }
        }
      }

      // 返回完整数据
      return tx.query.trips.findFirst({
        where: eq(trips.id, newTrip.id),
        with: {
          days: {
            with: {
              items: true
            }
          }
        }
      })
    })
  }

  async update(id: string, data: any) {
    return db.transaction(async (tx) => {
      // 1. 更新 Trip 标题
      await tx.update(trips)
        .set({ title: data.title, updatedAt: new Date() })
        .where(eq(trips.id, id))

      // 2. 删除旧的 Days (由于级联删除，Items 也会被删除)
      await tx.delete(days).where(eq(days.tripId, id))

      // 3. 重新创建 Days 和 Items
      if (data.days && Array.isArray(data.days)) {
        for (const dayData of data.days) {
          const [newDay] = await tx.insert(days).values({
            dayIndex: dayData.dayIndex,
            tripId: id
          }).returning()

          if (dayData.items && dayData.items.length > 0) {
            await tx.insert(items).values(
              dayData.items.map((item: any) => ({
                id: item.id,
                type: item.type,
                name: item.name,
                lngLat: item.lngLat || [],
                distance: item.distance,
                path: item.path,
                description: item.description,
                ticket: item.ticket,
                dayId: newDay.id
              }))
            )
          }
        }
      }

      // 返回更新后的完整数据
      return tx.query.trips.findFirst({
        where: eq(trips.id, id),
        with: {
          days: {
            with: {
              items: true
            }
          }
        }
      })
    })
  }

  async delete(id: string) {
    const [deletedTrip] = await db.delete(trips)
      .where(eq(trips.id, id))
      .returning()
    return deletedTrip
  }
}

export const tripRepository = new TripRepository()
