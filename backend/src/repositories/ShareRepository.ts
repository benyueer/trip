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
