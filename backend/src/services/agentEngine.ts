import { streamText, ModelMessage, stepCountIs, tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { agentRepository } from '../repositories/AgentRepository'
import { queryLocalPlaces, webSearch, saveUserMemory, createTripPlan, modifyTripPlan, planDayRoute, toolResultStore } from './agentTools'
import { logger } from './logger'
import { getMCPTools, callMCPTool } from './mcpClient'
import { z } from 'zod'

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
- 如果用户的问题与旅行无关，礼貌地告知你只能帮助旅行规划相关的问题
- 你还可以使用高德地图 MCP 工具进行路线规划和地点搜索（工具名以 mcp_ 为前缀）

地点信息获取流程（非常重要）：
- webSearch 只用于搜索概念和发现地点名称（如"千岛湖有哪些好玩的"）
- 拿到地点名称后，必须使用 mcp_maps_text_search 等高德 MCP 工具获取真实的经纬度、地址等地理信息
- 推荐给用户的地点必须来自高德 MCP 的可信数据（有真实坐标），不要使用 webSearch 的原始结果作为地点数据

单天规划流程：
- 当用户要求规划某一天的行程时（如"规划day2的千岛湖旅行"），使用 planDayRoute 工具生成方案
- planDayRoute 只生成备选方案，不会直接创建行程，用户需要确认后才生效
- 规划时先用 webSearch 搜索目的地信息获取地点名称，再用高德 MCP 获取每个地点的真实坐标
- 给出合理的路线顺序，考虑地理位置就近原则
- 回复时说明规划思路，并提示用户可以接受或拒绝方案`

export interface StreamMetadata {
  suggestedPlaces?: any[]
  tripId?: string
  tripTitle?: string
  modifiedTripId?: string
  reasoning?: string
  dayPlan?: any
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
      if ((trip as any).description) {
        systemPrompt += `\n行程主题: ${(trip as any).description}`
      }
      systemPrompt += `\n行程包含 ${trip.days.length} 天:`
      for (const day of trip.days) {
        const placeNames = day.items.filter(i => i.type === 'place').map(i => i.name)
        const dayDesc = (day as any).description ? ` (${(day as any).description})` : ''
        systemPrompt += `\n  第${day.dayIndex}天${dayDesc}: ${placeNames.join(' → ')}`
      }
    }
  }

  // 5. Reset tool result store before each run with unique runId
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  toolResultStore.reset(runId)

  // Build MCP tools dynamically from connected servers
  const mcpToolsMap: Record<string, any> = {}
  const mcpTools = getMCPTools()
  for (const mcpTool of mcpTools) {
    const toolName = `mcp_${mcpTool.name}`
    const properties = mcpTool.inputSchema?.properties || {}
    const required = new Set(mcpTool.inputSchema?.required || [])
    const zodShape: Record<string, any> = {}
    for (const [key, prop] of Object.entries(properties) as [string, any][]) {
      let field: any = prop.type === 'string' ? z.string() :
        prop.type === 'number' ? z.number() :
          prop.type === 'boolean' ? z.boolean() :
            z.any()
      if (prop.description) field = field.describe(prop.description)
      if (!required.has(key)) field = field.optional()
      zodShape[key] = field
    }
    mcpToolsMap[toolName] = tool({
      description: mcpTool.description,
      inputSchema: z.object(zodShape),
      execute: async (args: any) => {
        logger.agent.toolCall(toolName, args)
        const result = await callMCPTool(mcpTool.name, args)
        // Track MCP tool calls for fallback text generation
        if (!toolResultStore._mcpCalls) toolResultStore._mcpCalls = []
        toolResultStore._mcpCalls.push({ toolName, args, result })
        return result
      },
    })
  }

  // 6. Run agent with streaming + tools
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
      planDayRoute,
      ...mcpToolsMap,
    },
    stopWhen: stepCountIs(5),
    toolChoice: 'auto',
    onFinish: async ({ text, reasoning }) => {
      // Read tool results from the shared store (isolated by runId)
      const results = toolResultStore.getResults(runId)

      // Fallback: if model returned empty text, generate a summary from tool results
      let finalText = text
      if (!finalText || !finalText.trim()) {
        const parts: string[] = []

        // Extract place names from MCP text search results
        const mcpPlaces: string[] = []
        if (results._mcpCalls) {
          for (const call of results._mcpCalls) {
            if (call.toolName.includes('text_search') && call.result) {
              const content = Array.isArray(call.result) ? call.result : []
              for (const item of content) {
                if (item.type === 'text' && item.text) {
                  try {
                    const data = JSON.parse(item.text)
                    if (data.pois) {
                      for (const poi of data.pois.slice(0, 5)) {
                        if (poi.name) mcpPlaces.push(poi.name)
                      }
                    }
                  } catch {}
                }
              }
            }
          }
        }

        if (results.dayPlan) {
          parts.push(`已为您规划「${results.dayPlan.title}」，包含 ${results.dayPlan.places.length} 个地点：${results.dayPlan.places.map((p: any) => p.name).join('→')}，请查看下方方案卡片，可以接受或重新规划。`)
        } else if (results.suggestedPlaces && results.suggestedPlaces.length > 0) {
          parts.push(`为您找到 ${results.suggestedPlaces.length} 个相关地点：${results.suggestedPlaces.map((p: any) => p.name).join('、')}`)
        } else if (mcpPlaces.length > 0) {
          parts.push(`为您找到以下相关地点：${mcpPlaces.join('、')}`)
        }

        if (results.createdTripId) {
          parts.push(`已创建行程「${results.createdTripTitle}」`)
        }
        if (results.modifiedTripId) {
          parts.push(`已更新行程`)
        }

        finalText = parts.length > 0 ? parts.join('。') + '。' : '已处理您的请求。'
        logger.warn('agent', 'Model returned empty text, generated fallback', { fallback: finalText.slice(0, 200) })
      }
      const metadata: StreamMetadata = {}
      if (reasoning) {
        metadata.reasoning = Array.isArray(reasoning)
          ? reasoning.map((r: any) => r.text || JSON.stringify(r)).join('\n')
          : String(reasoning)
      }

      // Suggested places
      if (results.suggestedPlaces) {
        metadata.suggestedPlaces = results.suggestedPlaces
        logger.info('agent', `Found ${results.suggestedPlaces.length} suggested places`)
      }

      // Trip created
      if (results.createdTripId) {
        metadata.tripId = results.createdTripId
        metadata.tripTitle = results.createdTripTitle || ''
        logger.agent.tripCreated(results.createdTripId, results.createdTripTitle || '')
      }

      // Trip modified
      if (results.modifiedTripId) {
        metadata.modifiedTripId = results.modifiedTripId
        logger.agent.tripModified(results.modifiedTripId, results.modifiedAction || 'unknown')
      }

      // Day plan
      if (results.dayPlan) {
        metadata.dayPlan = results.dayPlan
        logger.info('agent', `Day plan ready: ${results.dayPlan.title}`)
      }

      // Log assistant response
      const toolsUsed: string[] = []
      if (results.suggestedPlaces) toolsUsed.push('search')
      if (results.createdTripId) toolsUsed.push('createTripPlan')
      if (results.modifiedTripId) toolsUsed.push('modifyTripPlan')
      if (results.dayPlan) toolsUsed.push('planDayRoute')
      logger.info('agent', `Response: ${finalText.slice(0, 150)}${finalText.length > 150 ? '...' : ''}`, {
        sessionId: sessionId.slice(0, 8),
        toolsUsed,
      })

      // Persist the final message + metadata to DB
      await agentRepository.createMessage(sessionId, 'assistant', finalText, metadata)

      // Resolve the metadata promise so the controller can append it to the stream
      resolveMetadata!(metadata)
    },
  })

  return { stream: result, metadataPromise }
}
