import { tool } from 'ai'
import { z } from 'zod'
import { agentRepository } from '../repositories/AgentRepository'
import { tripRepository } from '../repositories/TripRepository'
import { logger } from './logger'

// Shared store for tool execution results — tools write here, engine reads after stream
// Uses a runId to isolate results between concurrent message processing
export const toolResultStore = {
  runId: '',
  suggestedPlaces: null as any[] | null,
  createdTripId: null as string | null,
  createdTripTitle: null as string | null,
  modifiedTripId: null as string | null,
  modifiedAction: null as string | null,
  dayPlan: null as {
    dayIndex: number
    title: string
    description: string
    places: Array<{
      name: string
      lngLat: [number, number]
      description: string
      category: string
      address: string
      rating: string
      ticket: string
      openingHours: string
      order: number
    }>
    routeInfo?: {
      totalDistance: string
      totalDuration: string
    }
  } | null,
  reset(runId: string) {
    this.runId = runId
    this.suggestedPlaces = null
    this.createdTripId = null
    this.createdTripTitle = null
    this.modifiedTripId = null
    this.modifiedAction = null
    this.dayPlan = null
  },
  getResults(runId: string) {
    // Only return results if they belong to this run
    if (this.runId !== runId) return {}
    return {
      suggestedPlaces: this.suggestedPlaces,
      createdTripId: this.createdTripId,
      createdTripTitle: this.createdTripTitle,
      modifiedTripId: this.modifiedTripId,
      modifiedAction: this.modifiedAction,
      dayPlan: this.dayPlan,
    }
  },
}

// Tool 1: Query local places from database
export const queryLocalPlaces = tool({
  description: 'Search for travel destinations, attractions, and places in the local database. Returns matching places with coordinates, ratings, and details.',
  inputSchema: z.object({
    query: z.string().describe('Search keyword, e.g. "草原", "喀纳斯", "景德镇"'),
    limit: z.number().optional().default(10).describe('Max number of results'),
  }),
  execute: async ({ query, limit }) => {
    logger.agent.toolCall('queryLocalPlaces', { query, limit })
    const allPlaces = await tripRepository.findAllPlacesForUser('')
    const filtered = allPlaces
      .filter(p =>
        p.name.includes(query) ||
        p.description?.includes(query) ||
        p.category?.includes(query) ||
        p.address?.includes(query)
      )
      .slice(0, limit)
      .map(p => ({
        name: p.name,
        lngLat: p.lngLat,
        description: p.description,
        category: p.category,
        rating: p.rating,
        address: p.address,
        ticket: p.ticket,
        openingHours: p.openingHours,
      }))
    logger.info('tools', `queryLocalPlaces("${query}") → ${filtered.length} results`, {
      names: filtered.map(p => p.name),
    })
    toolResultStore.suggestedPlaces = filtered
    return { places: filtered, count: filtered.length }
  },
})

// Tool 2: Web search (Tavily — designed for AI agents)
export const webSearch = tool({
  description: 'Search the web for latest travel information, recommendations, and destination details. Use when local data is insufficient.',
  inputSchema: z.object({
    query: z.string().describe('Search query, e.g. "新疆草原推荐"'),
  }),
  execute: async ({ query }) => {
    logger.agent.toolCall('webSearch', { query })
    const tavilyKey = process.env.TAVILY_API_KEY
    if (!tavilyKey) {
      logger.error('tools', 'TAVILY_API_KEY not configured')
      return { answer: 'Web search not configured', results: [] }
    }
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          max_results: 5,
          include_answer: true,
          search_depth: 'basic',
        }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await response.json()
      const results = (data.results || []).map((r: any) => ({
        title: r.title || '',
        snippet: (r.content || '').slice(0, 200),
        url: r.url || '',
      }))
      const places = results.map((r: any) => ({
        name: r.title,
        lngLat: [0, 0] as [number, number],
        description: r.snippet,
        category: '',
        rating: '',
        address: r.url,
        ticket: '',
        openingHours: '',
      }))
      // Merge with existing suggested places from queryLocalPlaces
      toolResultStore.suggestedPlaces = [
        ...(toolResultStore.suggestedPlaces || []),
        ...places,
      ]
      logger.info('tools', `webSearch("${query}") → ${results.length} results`, {
        titles: results.map((r: any) => r.title),
        answer: (data.answer || '').slice(0, 100),
      })
      return {
        answer: data.answer || `Found ${results.length} results`,
        results,
      }
    } catch (error) {
      logger.error('tools', `webSearch("${query}") failed`, { error: String(error) })
      return { answer: 'Search temporarily unavailable', results: [] }
    }
  },
})

// Tool 3: Save user memory/preference
export const saveUserMemory = tool({
  description: 'Save a user travel preference or fact learned from conversation. Use when the user expresses a clear preference like "I prefer driving" or "I dislike hiking".',
  inputSchema: z.object({
    userId: z.string().describe('The user ID'),
    content: z.string().describe('The preference or fact to remember, e.g. "喜欢自驾游，不喜欢坐大巴"'),
    category: z.enum(['preference', 'habit', 'experience']).describe('Type of memory'),
  }),
  execute: async ({ userId, content, category }) => {
    logger.agent.toolCall('saveUserMemory', { content, category })
    // Check for similar existing memories to avoid duplicates
    const existing = await agentRepository.findMemoriesByUser(userId)
    const similar = existing.find(m =>
      m.content.includes(content) || content.includes(m.content)
    )
    if (similar) {
      await agentRepository.updateMemory(similar.id, content)
      logger.agent.memory('updated', content)
      return { saved: true, action: 'updated', memoryId: similar.id }
    }
    const memory = await agentRepository.createMemory(userId, content, category)
    logger.agent.memory('created', content)
    return { saved: true, action: 'created', memoryId: memory.id }
  },
})

// Tool 4: Create trip plan
export const createTripPlan = tool({
  description: 'Create a new trip itinerary with multiple days and places. Generates a complete trip in the database. Returns the new trip ID for frontend navigation.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID'),
    title: z.string().describe('Trip title, e.g. "伊犁三日游"'),
    description: z.string().optional().describe('Trip theme/description, e.g. "体验海滩风光"'),
    days: z.array(z.object({
      dayIndex: z.number(),
      description: z.string().optional().describe('Day theme, e.g. "青岛的海"'),
      items: z.array(z.object({
        name: z.string(),
        lngLat: z.array(z.number()).describe('[longitude, latitude]'),
        description: z.string().optional(),
        category: z.string().optional(),
        address: z.string().optional(),
        rating: z.string().optional(),
        ticket: z.string().optional(),
        openingHours: z.string().optional(),
      })),
    })).describe('Array of day plans, each with ordered places'),
  }),
  execute: async ({ userId, title, description, days }) => {
    logger.agent.toolCall('createTripPlan', { title, description, days: days.length })
    const tripData = {
      title,
      description: description || '',
      days: days.map(day => ({
        dayIndex: day.dayIndex,
        description: day.description || '',
        items: day.items.map(item => ({
          id: crypto.randomUUID(),
          type: 'place',
          name: item.name,
          lngLat: item.lngLat,
          description: item.description || '',
          category: item.category || '',
          address: item.address || '',
          rating: item.rating || '',
          ticket: item.ticket || '',
          openingHours: item.openingHours || '',
        })),
      })),
    }
    const trip = await tripRepository.create(tripData, userId)
    logger.agent.tripCreated(trip!.id, trip!.title)
    toolResultStore.createdTripId = trip!.id
    toolResultStore.createdTripTitle = trip!.title
    return { tripId: trip!.id, title: trip!.title, days: trip!.days.length }
  },
})

// Tool 5: Modify trip plan
export const modifyTripPlan = tool({
  description: 'Modify an existing trip by adding, removing, or replacing places. Automatically recalculates routes when places change.',
  inputSchema: z.object({
    tripId: z.string().describe('The trip ID to modify'),
    action: z.enum(['add', 'remove', 'replace']).describe('Type of modification'),
    dayIndex: z.number().describe('Which day to modify (1-based)'),
    placeName: z.string().describe('Name of the place to add/remove/replace'),
    newPlace: z.object({
      name: z.string(),
      lngLat: z.array(z.number()).describe('[longitude, latitude]'),
      description: z.string().optional(),
      category: z.string().optional(),
      address: z.string().optional(),
    }).optional().describe('New place data (required for add/replace)'),
  }),
  execute: async ({ tripId, action, dayIndex, placeName, newPlace }) => {
    logger.agent.toolCall('modifyTripPlan', { tripId: tripId.slice(0, 8), action, dayIndex, placeName })
    const trip = await tripRepository.findById(tripId)
    if (!trip) return { error: 'Trip not found' }

    const day = trip.days.find(d => d.dayIndex === dayIndex)
    if (!day) return { error: `Day ${dayIndex} not found` }

    if (action === 'remove') {
      day.items = day.items.filter(i => i.name !== placeName)
    } else if (action === 'add' && newPlace) {
      day.items.push({
        id: crypto.randomUUID(),
        type: 'place',
        name: newPlace.name,
        lngLat: newPlace.lngLat,
        description: newPlace.description || '',
        category: newPlace.category || '',
        address: newPlace.address || '',
        rating: '',
        ticket: '',
        openingHours: '',
        phone: '',
        notes: '',
        distance: null,
        duration: null,
        path: null,
      } as any)
    } else if (action === 'replace' && newPlace) {
      const idx = day.items.findIndex(i => i.name === placeName)
      if (idx >= 0) {
        day.items[idx] = {
          ...day.items[idx],
          name: newPlace.name,
          lngLat: newPlace.lngLat,
          description: newPlace.description || day.items[idx].description,
          category: newPlace.category || day.items[idx].category,
          address: newPlace.address || day.items[idx].address,
        } as any
      }
    }

    const updatedTrip = await tripRepository.update(tripId, trip)
    logger.agent.tripModified(updatedTrip!.id, `${action} "${placeName}" in day${dayIndex}`)
    toolResultStore.modifiedTripId = updatedTrip!.id
    toolResultStore.modifiedAction = action
    return {
      tripId: updatedTrip!.id,
      action,
      dayIndex,
      placeName,
      remainingPlaces: day.items.filter(i => i.type === 'place').length,
    }
  },
})

// Tool 6: Plan a single day route
export const planDayRoute = tool({
  description: 'Plan a single day itinerary with ordered places. Use when user asks to plan one specific day (e.g. "规划day2的千岛湖旅行"). Returns a plan for user review before creating the actual trip.',
  inputSchema: z.object({
    dayIndex: z.number().describe('Which day to plan (1-based)'),
    title: z.string().describe('Plan title, e.g. "千岛湖一日游"'),
    description: z.string().optional().describe('Day theme, e.g. "湖光山色"'),
    places: z.array(z.object({
      name: z.string().describe('Place name'),
      lngLat: z.array(z.number()).describe('[longitude, latitude]'),
      description: z.string().optional().describe('Why visit this place'),
      category: z.string().optional(),
      address: z.string().optional(),
      rating: z.string().optional(),
      ticket: z.string().optional(),
      openingHours: z.string().optional(),
      order: z.number().describe('Visit order (1-based)'),
    })).describe('Ordered list of places to visit'),
  }),
  execute: async ({ dayIndex, title, description, places }) => {
    logger.agent.toolCall('planDayRoute', { dayIndex, title, placesCount: places.length })
    const plan = {
      dayIndex,
      title,
      description: description || '',
      places: places.map(p => ({
        ...p,
        lngLat: p.lngLat as [number, number],
        description: p.description || '',
        category: p.category || '',
        address: p.address || '',
        rating: p.rating || '',
        ticket: p.ticket || '',
        openingHours: p.openingHours || '',
      })),
    }
    toolResultStore.dayPlan = plan
    logger.info('tools', `planDayRoute(day${dayIndex}, "${title}") → ${places.length} places`, {
      places: places.map(p => p.name),
    })
    return {
      status: 'plan_ready',
      plan,
      message: `已为您规划第${dayIndex}天的行程，请查看方案并选择接受或拒绝。`,
    }
  },
})
