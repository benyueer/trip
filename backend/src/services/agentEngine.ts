import { streamText, ModelMessage, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { agentRepository } from '../repositories/AgentRepository'
import { queryLocalPlaces, webSearch, saveUserMemory, createTripPlan, modifyTripPlan } from './agentTools'
import { logger } from './logger'

function getLLM() {
  const apiKey = process.env.LLM_API_KEY
  const baseURL = process.env.LLM_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1'
  const model = process.env.LLM_MODEL || 'mimo-v2.5-pro'

  if (!apiKey) throw new Error('LLM_API_KEY is not configured')

  // OpenAI-compatible provider — works with any API that implements the protocol
  const openai = createOpenAI({
    apiKey,
    baseURL,
    fetch: async (url, options) => {
      if (options && options.body && typeof options.body === 'string') {
        try {
          const body = JSON.parse(options.body)
          if (body.messages && Array.isArray(body.messages)) {
            body.messages = body.messages.map((m: any) => {
              if (m.role === 'assistant') {
                let reasoningText = ''
                let plainText = m.content

                if (Array.isArray(m.content)) {
                  const textParts = []
                  for (const part of m.content) {
                    if (part.type === 'reasoning') {
                      reasoningText = part.text || ''
                    } else if (part.type === 'text') {
                      textParts.push(part.text || '')
                    }
                  }
                  plainText = textParts.join('\n')
                }

                return {
                  ...m,
                  content: plainText || null,
                  reasoning_content: reasoningText || ' ',
                }
              }
              return m
            })
            options.body = JSON.stringify(body)
          }
        } catch (e) {
          console.error('Error rewriting request body:', e)
        }
      }
      return fetch(url, options)
    },
  })
  return openai.chat(model)
}

const SYSTEM_PROMPT = `你是一个专业的旅行规划助手。你的职责是：
1. 帮助用户探索和查询旅行目的地
2. 根据用户偏好规划行程路线
3. 动态修改已有行程
4. 记住用户的旅行偏好

回复规则：
- 使用中文回复
- 当推荐地点时，使用 queryLocalPlaces 工具查询本地数据，如数据不足则用 webSearch 补充
- 当用户表达偏好（如"我不喜欢爬山"）时，使用 saveUserMemory 工具保存
- 当用户要求规划行程时，使用 createTripPlan 工具创建
- 当用户要求修改行程时，使用 modifyTripPlan 工具修改
- 回复要简洁、有用，适合旅行场景
- 如果用户的问题与旅行无关，礼貌地告知你只能帮助旅行规划相关的问题`

export interface StreamMetadata {
  suggestedPlaces?: any[]
  tripId?: string
  tripTitle?: string
  modifiedTripId?: string
  reasoning?: string
}

/**
 * Builds the context (system prompt, history, memories) and returns a streamText result.
 * The caller is responsible for piping the stream to the HTTP response.
 */
export async function streamChatWithAgent(
  userId: string,
  sessionId: string,
  userMessage: string,
  currentTripId?: string,
): Promise<{ stream: any; metadataPromise: Promise<StreamMetadata> }> {
  // Metadata will be resolved when onFinish fires
  let resolveMetadata: (m: StreamMetadata) => void
  const metadataPromise = new Promise<StreamMetadata>(r => { resolveMetadata = r })
  // 1. Save user message
  await agentRepository.createMessage(sessionId, 'user', userMessage)

  // 2. Load short-term memory (conversation history)
  const history = await agentRepository.findMessagesBySession(sessionId)
  const messages: any[] = history
    .reverse()
    .slice(-20)
    .map(m => {
      if (m.role === 'assistant') {
        const meta = m.metadata as any
        let reasoning = ' '
        if (meta?.reasoning) {
          if (typeof meta.reasoning === 'string') {
            reasoning = meta.reasoning
          } else if (Array.isArray(meta.reasoning)) {
            reasoning = meta.reasoning
              .map((r: any) => (typeof r === 'string' ? r : JSON.stringify(r)))
              .join('\n') || ' '
          } else {
            reasoning = String(meta.reasoning)
          }
        }
        return {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: reasoning },
            { type: 'text', text: m.content || ' ' },
          ],
        }
      }
      return {
        role: m.role,
        content: m.content || ' ',
      }
    })

  // 3. Load long-term memory (user preferences)
  const memories = await agentRepository.findMemoriesByUser(userId)
  const memoryContext = memories.length > 0
    ? `\n\n用户旅行偏好（长期记忆）:\n${memories.map(m => `- ${m.content}`).join('\n')}`
    : ''

  // 4. Build system prompt with context
  let systemPrompt = SYSTEM_PROMPT + memoryContext
  if (currentTripId) {
    const { tripRepository } = await import('../repositories/TripRepository')
    const trip = await tripRepository.findById(currentTripId)
    if (trip) {
      systemPrompt += `\n\n当前正在编辑的行程: "${trip.title}" (ID: ${currentTripId})`
      systemPrompt += `\n行程包含 ${trip.days.length} 天:`
      for (const day of trip.days) {
        const placeNames = day.items.filter(i => i.type === 'place').map(i => i.name)
        systemPrompt += `\n  第${day.dayIndex}天: ${placeNames.join(' → ')}`
      }
    }
  }

  // 5. Run agent with streaming + tools
  const result = streamText({
    model: getLLM(),
    system: systemPrompt,
    messages,
    tools: {
      queryLocalPlaces,
      webSearch,
      saveUserMemory,
      createTripPlan,
      modifyTripPlan,
    },
    stopWhen: stepCountIs(5),
    toolChoice: 'auto',
    onFinish: async ({ text, toolResults, reasoning }) => {
      // Log tool calls
      for (const toolResult of toolResults) {
        logger.agent.toolCall(toolResult.toolName, (toolResult as any).input)
        logger.agent.toolResult(toolResult.toolName, toolResult.output)
      }

      // Extract metadata from tool results
      const metadata: StreamMetadata = {}
      if (reasoning) {
        metadata.reasoning = Array.isArray(reasoning)
          ? reasoning.map((r: any) => r.text || JSON.stringify(r)).join('\n')
          : String(reasoning)
      }
      for (const toolResult of toolResults) {
        if (toolResult.toolName === 'queryLocalPlaces' || toolResult.toolName === 'webSearch') {
          const res = toolResult.output as any
          if (res.places) {
            metadata.suggestedPlaces = res.places
          }
        }
        if (toolResult.toolName === 'createTripPlan') {
          const res = toolResult.output as any
          if (res.tripId) {
            metadata.tripId = res.tripId
            metadata.tripTitle = res.title
            logger.agent.tripCreated(res.tripId, res.title)
          }
        }
        if (toolResult.toolName === 'modifyTripPlan') {
          const res = toolResult.output as any
          if (res.tripId) {
            metadata.modifiedTripId = res.tripId
            logger.agent.tripModified(res.tripId, res.action)
          }
        }
        if (toolResult.toolName === 'saveUserMemory') {
          const res = toolResult.output as any
          if (res.saved) {
            logger.agent.memory(res.action, String((toolResult as any).input?.content || ''))
          }
        }
      }

      // Log assistant response
      logger.info('agent', `Response: ${text.slice(0, 150)}${text.length > 150 ? '...' : ''}`, {
        sessionId: sessionId.slice(0, 8),
        toolsUsed: toolResults.map(t => t.toolName),
      })

      // Persist the final message + metadata to DB
      await agentRepository.createMessage(sessionId, 'assistant', text, metadata)

      // Resolve the metadata promise so the controller can append it to the stream
      resolveMetadata!(metadata)
    },
  })

  return { stream: result, metadataPromise }
}
