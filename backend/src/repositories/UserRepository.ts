import { db } from '../db'
import { users } from '../db/schema'
import { eq, ilike, or } from 'drizzle-orm'

export class UserRepository {
  async findOrCreateByProvider(provider: string, providerId: string, profile: {
    email: string
    name: string
    avatar?: string
  }) {
    const existing = await db.query.users.findFirst({
      where: or(
        eq(users.providerId, providerId),
        eq(users.email, profile.email),
      ),
    })

    if (existing) {
      if (existing.name !== profile.name || existing.avatar !== profile.avatar) {
        await db.update(users)
          .set({ name: profile.name, avatar: profile.avatar, updatedAt: new Date() })
          .where(eq(users.id, existing.id))
      }
      return existing
    }

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
