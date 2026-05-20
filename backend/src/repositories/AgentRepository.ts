import { db } from '../db'
import { agentSessions, agentMessages, userMemories } from '../db/schema'
import { eq, desc, and } from 'drizzle-orm'

export class AgentRepository {
  // --- Sessions ---
  async findSessionsByUser(userId: string) {
    return db.query.agentSessions.findMany({
      where: eq(agentSessions.userId, userId),
      orderBy: [desc(agentSessions.updatedAt)],
    })
  }

  async findSessionById(id: string) {
    return db.query.agentSessions.findFirst({
      where: eq(agentSessions.id, id),
      with: {
        messages: {
          orderBy: [desc(agentMessages.createdAt)],
        },
      },
    })
  }

  async createSession(userId: string, title: string) {
    const [session] = await db.insert(agentSessions)
      .values({ userId, title })
      .returning()
    return session
  }

  async updateSessionTitle(id: string, title: string) {
    const [session] = await db.update(agentSessions)
      .set({ title, updatedAt: new Date() })
      .where(eq(agentSessions.id, id))
      .returning()
    return session
  }

  async deleteSession(id: string) {
    await db.delete(agentSessions).where(eq(agentSessions.id, id))
  }

  // --- Messages ---
  async findMessagesBySession(sessionId: string) {
    return db.query.agentMessages.findMany({
      where: eq(agentMessages.sessionId, sessionId),
      orderBy: [desc(agentMessages.createdAt)],
    })
  }

  async createMessage(sessionId: string, role: string, content: string, metadata?: any) {
    const [message] = await db.insert(agentMessages)
      .values({ sessionId, role, content, metadata })
      .returning()

    // Touch session updatedAt
    await db.update(agentSessions)
      .set({ updatedAt: new Date() })
      .where(eq(agentSessions.id, sessionId))

    return message
  }

  // --- User Memories ---
  async findMemoriesByUser(userId: string) {
    return db.query.userMemories.findMany({
      where: eq(userMemories.userId, userId),
      orderBy: [desc(userMemories.updatedAt)],
    })
  }

  async createMemory(userId: string, content: string, category: string = 'preference') {
    const [memory] = await db.insert(userMemories)
      .values({ userId, content, category })
      .returning()
    return memory
  }

  async updateMemory(id: string, content: string) {
    const [memory] = await db.update(userMemories)
      .set({ content, updatedAt: new Date() })
      .where(eq(userMemories.id, id))
      .returning()
    return memory
  }

  async deleteMemory(id: string) {
    await db.delete(userMemories).where(eq(userMemories.id, id))
  }
}

export const agentRepository = new AgentRepository()
