import { Request, Response } from 'express'
import { agentRepository } from '../repositories/AgentRepository'
import { classifyIntent } from '../services/intentClassifier'
import { streamChatWithAgent } from '../services/agentEngine'
import { logger } from '../services/logger'

export const getSessions = async (req: Request, res: Response) => {
  try {
    const sessions = await agentRepository.findSessionsByUser(req.user!.id)
    res.json(sessions)
  } catch (error) {
    logger.error('agent', 'Failed to fetch sessions', { error: String(error) })
    res.status(500).json({ error: 'Failed to fetch sessions' })
  }
}

export const createSession = async (req: Request, res: Response) => {
  try {
    const { title } = req.body
    const session = await agentRepository.createSession(
      req.user!.id,
      title || '新对话'
    )
    logger.info('agent', 'Session created', { sessionId: session.id.slice(0, 8), title: session.title })
    res.status(201).json(session)
  } catch (error) {
    logger.error('agent', 'Failed to create session', { error: String(error) })
    res.status(500).json({ error: 'Failed to create session' })
  }
}

export const deleteSession = async (req: Request, res: Response) => {
  try {
    await agentRepository.deleteSession(req.params.id as string)
    logger.info('agent', 'Session deleted', { sessionId: (req.params.id as string).slice(0, 8) })
    res.status(204).send()
  } catch (error) {
    logger.error('agent', 'Failed to delete session', { error: String(error) })
    res.status(500).json({ error: 'Failed to delete session' })
  }
}

export const getMessages = async (req: Request, res: Response) => {
  try {
    const messages = await agentRepository.findMessagesBySession(req.params.id as string)
    res.json(messages.reverse())
  } catch (error) {
    logger.error('agent', 'Failed to fetch messages', { error: String(error) })
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
}

export const chat = async (req: Request, res: Response) => {
  try {
    const { content, currentTripId } = req.body
    const sessionId = req.params.id as string

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Message content is required' })
      return
    }

    // Log incoming message
    logger.agent.chat(req.user!.id, sessionId, content)

    // Intent recognition gate
    const intent = classifyIntent(content)
    logger.agent.intent(intent.category, intent.confidence, content)

    if (intent.category === 'harmful') {
      const reply = '抱歉，我只能帮助旅行规划相关的问题。请不要尝试执行与旅行无关的操作。'
      await agentRepository.createMessage(sessionId, 'user', content)
      await agentRepository.createMessage(sessionId, 'assistant', reply, { intent: 'harmful', blocked: true })
      logger.agent.blocked('harmful', content)
      res.json({ content: reply, metadata: { blocked: true, reason: 'harmful' } })
      return
    }

    if (intent.category === 'off_topic') {
      const reply = '这个问题似乎与旅行规划无关呢～我是旅行规划助手，可以帮你查询目的地、规划行程、推荐景点等。有什么旅行相关的问题我可以帮你的吗？'
      await agentRepository.createMessage(sessionId, 'user', content)
      await agentRepository.createMessage(sessionId, 'assistant', reply, { intent: 'off_topic', blocked: true })
      logger.agent.blocked('off_topic', content)
      res.json({ content: reply, metadata: { blocked: true, reason: 'off_topic' } })
      return
    }

    // Trip-related: stream the agent response via SSE
    logger.agent.streamStart(sessionId)
    const startTime = Date.now()
    const { stream, metadataPromise } = await streamChatWithAgent(req.user!.id, sessionId, content, currentTripId)

    // Pipe the AI SDK stream directly to the HTTP response as SSE
    const streamResponse = stream.toTextStreamResponse()
    const reader = streamResponse.body!.getReader()

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    let totalChars = 0
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
        totalChars += value.length
      }
    }

    await pump()

    // Wait for onFinish to complete and append metadata to the stream
    const metadata = await metadataPromise
    const metaLine = `\n__AGENT_META__${JSON.stringify(metadata)}`
    res.write(metaLine)
    res.end()

    const elapsed = Date.now() - startTime
    logger.agent.streamEnd(sessionId, totalChars)
    logger.info('agent', `Chat completed in ${elapsed}ms`, { sessionId: sessionId.slice(0, 8), chars: totalChars })
  } catch (error) {
    logger.error('agent', 'Chat failed', { error: String(error) })
    if (!res.headersSent) {
      res.status(500).json({ error: 'Agent processing failed' })
    } else {
      res.end()
    }
  }
}

export const getMemories = async (req: Request, res: Response) => {
  try {
    const memories = await agentRepository.findMemoriesByUser(req.user!.id)
    res.json(memories)
  } catch (error) {
    logger.error('agent', 'Failed to fetch memories', { error: String(error) })
    res.status(500).json({ error: 'Failed to fetch memories' })
  }
}

export const deleteMemory = async (req: Request, res: Response) => {
  try {
    await agentRepository.deleteMemory(req.params.memoryId as string)
    logger.info('agent', 'Memory deleted', { memoryId: (req.params.memoryId as string).slice(0, 8) })
    res.status(204).send()
  } catch (error) {
    logger.error('agent', 'Failed to delete memory', { error: String(error) })
    res.status(500).json({ error: 'Failed to delete memory' })
  }
}
