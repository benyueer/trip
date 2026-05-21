import { tool } from 'ai'
import { z } from 'zod'
import { agentRepository } from '../repositories/AgentRepository'
import { tripRepository } from '../repositories/TripRepository'

// Shared store for tool execution results — tools write here, engine reads after stream
// Uses a runId to isolate results between concurrent message processing
export const toolResultStore = {
  runId: '',
  suggestedPlaces: null as any[] | null,
  createdTripId: null as string | null,
  createdTripTitle: null as string | null,
  modifiedTripId: null as string | null,
  modifiedAction: null as string | null,
  reset(runId: string) {
    this.runId = runId
    this.suggestedPlaces = null
    this.createdTripId = null
    this.createdTripTitle = null
    this.modifiedTripId = null
    this.modifiedAction = null
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
    toolResultStore.suggestedPlaces = filtered
    return { places: filtered, count: filtered.length }
  },
})

// Tool 2: Web search (via Tavily or fallback)
export const webSearch = tool({
  description: 'Search the web for latest travel information, recommendations, and destination details. Use when local data is insufficient.',
  inputSchema: z.object({
    query: z.string().describe('Search query, e.g. "新疆草原推荐 2025"'),
  }),
  execute: async ({ query }) => {
    const tavilyKey = process.env.TAVILY_API_KEY
    if (tavilyKey) {
      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query,
            max_results: 5,
            include_answer: true,
          }),
        })
        const data = await response.json()
        return {
          answer: data.answer || '',
          results: (data.results || []).map((r: any) => ({
            title: r.title,
            snippet: r.content?.slice(0, 200),
            url: r.url,
          })),
        }
      } catch (error) {
        return { answer: 'Search temporarily unavailable', results: [] }
      }
    }
    // Fallback: return empty with message
    return {
      answer: 'Web search is not configured. Please set TAVILY_API_KEY.',
      results: [],
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
    // Check for similar existing memories to avoid duplicates
    const existing = await agentRepository.findMemoriesByUser(userId)
    const similar = existing.find(m =>
      m.content.includes(content) || content.includes(m.content)
    )
    if (similar) {
      await agentRepository.updateMemory(similar.id, content)
      return { saved: true, action: 'updated', memoryId: similar.id }
    }
    const memory = await agentRepository.createMemory(userId, content, category)
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
