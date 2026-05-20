import { Request, Response } from 'express'
import { agentRepository } from '../repositories/AgentRepository'
import { classifyIntent } from '../services/intentClassifier'
import { streamChatWithAgent } from '../services/agentEngine'

export const getSessions = async (req: Request, res: Response) => {
  try {
    const sessions = await agentRepository.findSessionsByUser(req.user!.id)
    res.json(sessions)
  } catch (error) {
    console.error('Error fetching sessions:', error)
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
    res.status(201).json(session)
  } catch (error) {
    console.error('Error creating session:', error)
    res.status(500).json({ error: 'Failed to create session' })
  }
}

export const deleteSession = async (req: Request, res: Response) => {
  try {
    await agentRepository.deleteSession(req.params.id as string)
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting session:', error)
    res.status(500).json({ error: 'Failed to delete session' })
  }
}

export const getMessages = async (req: Request, res: Response) => {
  try {
    const messages = await agentRepository.findMessagesBySession(req.params.id as string)
    res.json(messages.reverse()) // Return in chronological order
  } catch (error) {
    console.error('Error fetching messages:', error)
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

    // Intent recognition gate
    const intent = classifyIntent(content)

    if (intent.category === 'harmful') {
      const reply = '抱歉，我只能帮助旅行规划相关的问题。请不要尝试执行与旅行无关的操作。'
      await agentRepository.createMessage(sessionId, 'user', content)
      await agentRepository.createMessage(sessionId, 'assistant', reply, { intent: 'harmful', blocked: true })
      res.json({ content: reply, metadata: { blocked: true, reason: 'harmful' } })
      return
    }

    if (intent.category === 'off_topic') {
      const reply = '这个问题似乎与旅行规划无关呢～我是旅行规划助手，可以帮你查询目的地、规划行程、推荐景点等。有什么旅行相关的问题我可以帮你的吗？'
      await agentRepository.createMessage(sessionId, 'user', content)
      await agentRepository.createMessage(sessionId, 'assistant', reply, { intent: 'off_topic', blocked: true })
      res.json({ content: reply, metadata: { blocked: true, reason: 'off_topic' } })
      return
    }

    // Trip-related: stream the agent response via SSE
    const result = await streamChatWithAgent(req.user!.id, sessionId, content, currentTripId)

    // Pipe the AI SDK stream directly to the HTTP response as SSE
    const streamResponse = result.toTextStreamResponse()
    const reader = streamResponse.body!.getReader()

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    }

    await pump()
  } catch (error) {
    console.error('Error in agent chat:', error)
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
    console.error('Error fetching memories:', error)
    res.status(500).json({ error: 'Failed to fetch memories' })
  }
}

export const deleteMemory = async (req: Request, res: Response) => {
  try {
    await agentRepository.deleteMemory(req.params.memoryId as string)
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting memory:', error)
    res.status(500).json({ error: 'Failed to delete memory' })
  }
}
