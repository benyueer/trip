import { create } from 'zustand'
import axios from 'axios'

const genId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

export type ItemType = 'place' | 'route'

export interface Place {
  id: string
  type: 'place'
  name: string
  description?: string
  ticket?: string
  address?: string
  phone?: string
  openingHours?: string
  rating?: string
  category?: string
  notes?: string
  lngLat: [number, number]
}

export interface Route {
  id: string
  type: 'route'
  name: string
  distance: string
  duration?: string
  path: [number, number][]
}

export type TripItem = Place | Route

export interface DayPlan {
  id?: string
  dayIndex: number
  description?: string
  items: TripItem[]
}

export interface Trip {
  id: string
  title: string
  description?: string
  createdAt: string
  updatedAt: string
  days: DayPlan[]
}

export interface EditingItem {
  type: 'add' | 'edit'
  dayIndex: number
  item?: Partial<Place>
  lngLat?: [number, number]
}

// Place from all-trips cache (includes trip context)
export interface CachedPlace extends Place {
  tripId: string
  tripTitle: string
}

export interface User {
  id: string
  email: string
  name: string
  avatar: string | null
  provider: string
}

export interface Share {
  id: string
  tripId: string
  userId: string
  permission: string
  createdAt: string
  user: User
}

export interface AgentSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface AgentMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  metadata?: {
    error?: boolean
    suggestedPlaces?: Array<{
      name: string
      lngLat: [number, number]
      description?: string
      category?: string
      rating?: string
      address?: string
      ticket?: string
    }>
    tripId?: string
    tripTitle?: string
    modifiedTripId?: string
    blocked?: boolean
    reason?: string
    dayPlan?: {
      dayIndex: number
      title: string
      description?: string
      places: Array<{
        name: string
        lngLat: [number, number]
        description?: string
        category?: string
        address?: string
        rating?: string
        ticket?: string
        openingHours?: string
        order: number
      }>
      routeInfo?: {
        totalDistance: string
        totalDuration: string
      }
    }
  }
  toolSteps?: Array<{
    tool: string
    toolCallId: string
    status: 'running' | 'done'
    input?: Record<string, any>
    output?: string
  }>
  createdAt: string
}

export interface UserMemory {
  id: string
  content: string
  category: string
  createdAt: string
  updatedAt: string
}

export interface TripState {
  trips: Trip[]
  currentTrip: Trip | null
  highlightedId: string | null
  activeDayIndex: number
  loading: boolean
  isEditMode: boolean
  editingItem: EditingItem | null

  // All-places cache
  allPlacesCache: CachedPlace[] | null
  allPlacesCacheTime: number
  allPlacesLoading: boolean
  showAllPlaces: boolean

  // Auth
  user: User | null
  isAuthenticated: boolean
  authChecked: boolean
  isGuest: boolean

  // Actions
  fetchTrips: () => Promise<void>
  fetchTripById: (id: string) => Promise<void>
  createTrip: (title: string) => Promise<void>
  deleteTrip: (id: string) => Promise<void>
  updateCurrentTrip: (data: Partial<Trip>) => Promise<void>
  addDay: () => Promise<void>
  deleteDay: (dayIndex: number) => Promise<void>

  setHighlightedId: (id: string | null) => void
  setActiveDayIndex: (index: number) => void
  setIsEditMode: (isEditMode: boolean) => void
  setEditingItem: (item: EditingItem | null) => void

  addPlace: (dayIndex: number, place: Place) => Promise<void>
  updatePlace: (dayIndex: number, placeId: string, data: Partial<Place>) => void
  deleteItem: (dayIndex: number, itemId: string) => Promise<void>
  addRoute: (dayIndex: number, route: Route) => void
  calculateAndAddRoute: (dayIndex: number, startPlace: Place, endPlace: Place, mode: string) => Promise<void>
  reorderItems: (dayIndex: number, newItems: TripItem[]) => Promise<void>
  moveItem: (fromDayIndex: number, toDayIndex: number, itemId: string) => Promise<void>
  autoRecalculateRoutes: (dayIndex: number) => Promise<void>

  // All-places actions
  fetchAllPlaces: () => Promise<void>
  setShowAllPlaces: (show: boolean) => void

  // Routing State
  isRouting: boolean
  routingStartItem: Place | null
  routingEndItem: Place | null
  startRouting: () => void
  cancelRouting: () => void
  setRoutingStart: (item: Place) => void
  setRoutingEnd: (item: Place) => void

  fetchMe: () => Promise<void>
  logout: () => Promise<void>

  // Agent
  agentSessions: AgentSession[]
  activeAgentSessionId: string | null
  agentMessages: AgentMessage[]
  agentSuggestedPlaces: NonNullable<AgentMessage['metadata']>['suggestedPlaces'] | null
  agentLoading: boolean
  isAgentPanelOpen: boolean
  agentPlanRoutes: Array<{
    distance: string
    duration: string
    path: [number, number][]
  }> | null
  agentIntent: string | null

  // Agent actions
  fetchAgentSessions: () => Promise<void>
  createAgentSession: (title?: string) => Promise<string>
  updateAgentSession: (id: string, title: string) => Promise<void>
  deleteAgentSession: (id: string) => Promise<void>
  setActiveAgentSession: (id: string) => Promise<void>
  sendAgentMessage: (content: string, currentTripId?: string, intent?: string) => Promise<void>
  setAgentPanelOpen: (open: boolean) => void
  clearSuggestedPlaces: () => void
  addSuggestedPlaceToTrip: (place: { name: string; lngLat: [number, number]; description?: string; category?: string; address?: string; rating?: string; ticket?: string; openingHours?: string; phone?: string; notes?: string }, dayIndex?: number) => Promise<void>
  setAgentPlanRoutes: (routes: Array<{ distance: string; duration: string; path: [number, number][] }> | null) => void
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  currentTrip: null,
  highlightedId: null,
  activeDayIndex: 1,
  loading: false,
  isEditMode: false,
  editingItem: null,
  allPlacesCache: null,
  allPlacesCacheTime: 0,
  allPlacesLoading: false,
  showAllPlaces: false,

  user: null,
  isAuthenticated: false,
  authChecked: false,
  isGuest: false,

  fetchTrips: async () => {
    set({ loading: true })
    try {
      const response = await axios.get(`${API_BASE_URL}/trips`, { withCredentials: true })
      set({ trips: response.data, loading: false })
    } catch (error) {
      console.error('Failed to fetch trips:', error)
      set({ loading: false })
    }
  },

  fetchTripById: async (id) => {
    set({ loading: true })
    try {
      const response = await axios.get(`${API_BASE_URL}/trips/${id}`, { withCredentials: true })
      set({ currentTrip: response.data, loading: false, activeDayIndex: 1 })
    } catch (error) {
      console.error('Failed to fetch trip:', error)
      set({ loading: false })
    }
  },

  createTrip: async (title) => {
    try {
      await axios.post(`${API_BASE_URL}/trips`, { title }, { withCredentials: true })
      get().fetchTrips()
    } catch (error) {
      console.error('Failed to create trip:', error)
    }
  },

  deleteTrip: async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/trips/${id}`, { withCredentials: true })
      get().fetchTrips()
    } catch (error) {
      console.error('Failed to delete trip:', error)
    }
  },

  updateCurrentTrip: async (data) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    try {
      const response = await axios.put(`${API_BASE_URL}/trips/${currentTrip.id}`, {
        ...currentTrip,
        ...data
      }, { withCredentials: true })
      set({ currentTrip: response.data, allPlacesCache: null, allPlacesCacheTime: 0 })
    } catch (error) {
      console.error('Failed to update trip:', error)
    }
  },

  setHighlightedId: (id) => set({ highlightedId: id }),

  setActiveDayIndex: (activeDayIndex) => set({ activeDayIndex }),

  setIsEditMode: (isEditMode) => set({ isEditMode, highlightedId: null, editingItem: null }),

  setEditingItem: (editingItem) => set({ editingItem }),

  addPlace: async (dayIndex, place) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    const newDays = [...currentTrip.days]
    let day = newDays.find(d => d.dayIndex === dayIndex)
    if (!day) {
      day = { dayIndex, items: [] }
      newDays.push(day)
    }
    day.items.push(place)

    await get().updateCurrentTrip({ days: newDays })
    await get().autoRecalculateRoutes(dayIndex)
  },

  updatePlace: (dayIndex, placeId, data) => {
    const { currentTrip } = get()
    if (!currentTrip) return
    const newDays = currentTrip.days.map(day => {
      if (day.dayIndex === dayIndex) {
        return {
          ...day,
          items: day.items.map(item => {
            if (item.id === placeId) {
              return { ...item, ...data } as TripItem
            }
            return item
          })
        }
      }
      return day
    })
    get().updateCurrentTrip({ days: newDays })
  },

  deleteItem: async (dayIndex, itemId) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    const day = currentTrip.days.find(d => d.dayIndex === dayIndex)
    const itemToDelete = day?.items.find(i => i.id === itemId)
    const isPlace = itemToDelete?.type === 'place'

    const newDays = currentTrip.days.map(d => {
      if (d.dayIndex === dayIndex) {
        return {
          ...d,
          // 如果删除的是地点，把同天里的所有路线也去掉，之后会通过 autoRecalculateRoutes 重新规划
          // 如果删除的是路线本身，则只过滤该路线，不重新算其它路线
          items: d.items.filter(item => 
            item.id !== itemId && !(isPlace && item.type === 'route')
          )
        }
      }
      return d
    })

    await get().updateCurrentTrip({ days: newDays })
    if (isPlace) {
      await get().autoRecalculateRoutes(dayIndex)
    }
  },

  calculateAndAddRoute: async (dayIndex: number, startPlace: Place, endPlace: Place, mode: string) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    set({ loading: true })
    try {
      const modeName = mode === 'Driving' ? '驾车' : mode === 'Walking' ? '步行' : '骑行'
      const name = `${startPlace.name} 到 ${endPlace.name} (${modeName})`

      const response = await axios.post(`${API_BASE_URL}/trips/${currentTrip.id}/days/${dayIndex}/routes`, {
        routeId: genId(),
        startLngLat: startPlace.lngLat,
        endLngLat: endPlace.lngLat,
        mode,
        name
      }, { withCredentials: true })

      set({ currentTrip: response.data, loading: false })
      get().cancelRouting()
    } catch (error) {
      console.error('Failed to calculate and add route:', error)
      alert('无法规划路线，请重试')
      set({ loading: false })
    }
  },

  addRoute: (dayIndex, route) => {
    // Legacy addRoute, not used anymore but kept for compatibility
    const { currentTrip } = get()
    if (!currentTrip) return

    const newDays = [...currentTrip.days]
    let day = newDays.find(d => d.dayIndex === dayIndex)
    if (!day) {
      day = { dayIndex, items: [] }
      newDays.push(day)
    }
    day.items.push(route)

    get().updateCurrentTrip({ days: newDays })
  },

  // 在同一天内重新排序
  reorderItems: async (dayIndex, newItems) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    const newDays = currentTrip.days.map(day => {
      if (day.dayIndex === dayIndex) {
        return { ...day, items: newItems }
      }
      return day
    })

    await get().updateCurrentTrip({ days: newDays })
    await get().autoRecalculateRoutes(dayIndex)
  },

  // 将某个条目从一天移动到另一天
  moveItem: async (fromDayIndex, toDayIndex, itemId) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    let itemToMove: any = null
    const newDays = currentTrip.days.map(day => {
      if (day.dayIndex === fromDayIndex) {
        const found = day.items.find(i => i.id === itemId)
        if (found) itemToMove = found
        return { ...day, items: day.items.filter(i => i.id !== itemId) }
      }
      return day
    })

    if (!itemToMove) return

    const targetDay = newDays.find(d => d.dayIndex === toDayIndex)
    if (targetDay) {
      targetDay.items.push(itemToMove)
    }

    await get().updateCurrentTrip({ days: newDays })
    await get().autoRecalculateRoutes(fromDayIndex)
    await get().autoRecalculateRoutes(toDayIndex)
  },

  // 自动重新计算某一天的路线
  autoRecalculateRoutes: async (dayIndex: number) => {
    const { currentTrip, updateCurrentTrip } = get()
    if (!currentTrip) return

    const day = currentTrip.days.find(d => d.dayIndex === dayIndex)
    if (!day) return

    // 1. 过滤出所有的地点，丢弃路线
    const places = day.items.filter(item => item.type === 'place') as Place[]

    // 2. 本地即时清理路线并保存
    const updatedDays = currentTrip.days.map(d => {
      if (d.dayIndex === dayIndex) {
        return { ...d, items: [...places] }
      }
      return d
    })

    const updatedTrip = { ...currentTrip, days: updatedDays }
    set({ currentTrip: updatedTrip })

    // 如果地点少于2个，无需重新规划路线，直接写回后端即可
    if (places.length < 2) {
      await updateCurrentTrip({ days: updatedDays })
      return
    }

    // 3. 顺次向后端请求路线，并交织插入 items 数组
    const finalItems: TripItem[] = [places[0]]

    for (let i = 0; i < places.length - 1; i++) {
      const start = places[i]
      const end = places[i + 1]
      try {
        const mode = 'Driving'
        const modeName = '驾车'
        const name = `${start.name} 到 ${end.name} (${modeName})`

        const response = await axios.post(`${API_BASE_URL}/trips/${currentTrip.id}/days/${dayIndex}/routes`, {
          routeId: genId(),
          startLngLat: start.lngLat,
          endLngLat: end.lngLat,
          mode,
          name
        }, { withCredentials: true })

        const newTrip = response.data
        const dayFromNewTrip = newTrip.days.find((d: any) => d.dayIndex === dayIndex)
        // 找到最新追加的 route 节点
        const addedRoute = dayFromNewTrip?.items.find((item: any) => item.type === 'route' && !finalItems.some(f => f.id === item.id))

        if (addedRoute) {
          finalItems.push(addedRoute)
        }
      } catch (err) {
        console.error('Auto routing failed:', err)
      }
      finalItems.push(places[i + 1])
    }

    // 4. 将完整排好序、路线交叉好的数组再次更新提交给后端
    const finalDays = currentTrip.days.map(d => {
      if (d.dayIndex === dayIndex) {
        return { ...d, items: finalItems }
      }
      return d
    })
    await updateCurrentTrip({ days: finalDays })
  },

  addDay: async () => {
    const { currentTrip } = get()
    if (!currentTrip) return

    const newDays = [...currentTrip.days]
    const nextIndex = newDays.length > 0
      ? Math.max(...newDays.map(d => d.dayIndex)) + 1
      : 1

    newDays.push({
      dayIndex: nextIndex,
      items: []
    })

    // 保持 dayIndex 连续
    const sortedDays = newDays.sort((a, b) => a.dayIndex - b.dayIndex)
      .map((d, i) => ({ ...d, dayIndex: i + 1 }))

    await get().updateCurrentTrip({ days: sortedDays })
  },

  deleteDay: async (dayIndex) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    const newDays = currentTrip.days
      .filter(d => d.dayIndex !== dayIndex)
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .map((d, i) => ({ ...d, dayIndex: i + 1 }))

    await get().updateCurrentTrip({ days: newDays })
  },

  // All-places actions
  setShowAllPlaces: (show) => set({ showAllPlaces: show }),

  fetchAllPlaces: async () => {
    const { allPlacesCache, allPlacesCacheTime } = get()
    const now = Date.now()
    // 5-minute cache TTL
    if (allPlacesCache && allPlacesCacheTime && now - allPlacesCacheTime < 5 * 60 * 1000) {
      return
    }
    set({ allPlacesLoading: true })
    try {
      const response = await axios.get(`${API_BASE_URL}/trips/places`, { withCredentials: true })
      set({ allPlacesCache: response.data, allPlacesCacheTime: now, allPlacesLoading: false })
    } catch (error) {
      console.error('Failed to fetch all places:', error)
      set({ allPlacesLoading: false })
    }
  },

  // Routing implementation
  isRouting: false,
  routingStartItem: null,
  routingEndItem: null,

  startRouting: () => set({
    isRouting: true,
    routingStartItem: null,
    routingEndItem: null,
    highlightedId: null
  }),

  cancelRouting: () => set({
    isRouting: false,
    routingStartItem: null,
    routingEndItem: null
  }),

  setRoutingStart: (item) => set({ routingStartItem: item }),

  setRoutingEnd: (item) => set({ routingEndItem: item }),

  fetchMe: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL.replace('/api', '')}/auth/me`, {
        withCredentials: true,
      })
      const user = response.data
      set({ user, isAuthenticated: true, authChecked: true, isGuest: user?.provider === 'guest' })
    } catch {
      let loggedInAsGuest = false
      if (localStorage.getItem('is_guest') === 'true') {
        try {
          const response = await axios.get(`${API_BASE_URL.replace('/api', '')}/auth/guest-login`, {
            withCredentials: true,
          })
          const user = response.data
          set({ user, isAuthenticated: true, authChecked: true, isGuest: true })
          loggedInAsGuest = true
        } catch {
          localStorage.removeItem('is_guest')
        }
      }
      if (!loggedInAsGuest) {
        set({ user: null, isAuthenticated: false, authChecked: true, isGuest: false })
      }
    }
  },

  logout: async () => {
    try {
      await axios.post(`${API_BASE_URL.replace('/api', '')}/auth/logout`, {}, {
        withCredentials: true,
      })
    } catch {
      // Ignore errors on logout
    }
    localStorage.removeItem('is_guest')
    set({ user: null, isAuthenticated: false, isGuest: false, currentTrip: null, trips: [] })
  },

  // Agent state — restore last active session from localStorage
  agentSessions: [],
  activeAgentSessionId: localStorage.getItem('agent_active_session_id'),
  agentMessages: [],
  agentSuggestedPlaces: null,
  agentLoading: false,
  isAgentPanelOpen: false,
  agentPlanRoutes: null,
  agentIntent: null as string | null,

  fetchAgentSessions: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/agent/sessions`, { withCredentials: true })
      set({ agentSessions: response.data })
    } catch (error) {
      console.error('Failed to fetch agent sessions:', error)
    }
  },

  createAgentSession: async (title) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/agent/sessions`, { title }, { withCredentials: true })
      const session = response.data
      set(state => ({ agentSessions: [session, ...state.agentSessions] }))
      return session.id
    } catch (error) {
      console.error('Failed to create agent session:', error)
      return ''
    }
  },

  updateAgentSession: async (id, title) => {
    try {
      const response = await axios.patch(`${API_BASE_URL}/agent/sessions/${id}`, { title }, { withCredentials: true })
      set(state => ({
        agentSessions: state.agentSessions.map(s => s.id === id ? { ...s, title: response.data.title } : s),
      }))
    } catch (error) {
      console.error('Failed to update agent session:', error)
    }
  },

  deleteAgentSession: async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/agent/sessions/${id}`, { withCredentials: true })
      if (localStorage.getItem('agent_active_session_id') === id) {
        localStorage.removeItem('agent_active_session_id')
      }
      set(state => ({
        agentSessions: state.agentSessions.filter(s => s.id !== id),
        activeAgentSessionId: state.activeAgentSessionId === id ? null : state.activeAgentSessionId,
        agentMessages: state.activeAgentSessionId === id ? [] : state.agentMessages,
      }))
    } catch (error) {
      console.error('Failed to delete agent session:', error)
    }
  },

  setActiveAgentSession: async (id) => {
    localStorage.setItem('agent_active_session_id', id)
    set({ activeAgentSessionId: id, agentMessages: [], agentSuggestedPlaces: null })
    try {
      const response = await axios.get(`${API_BASE_URL}/agent/sessions/${id}/messages`, { withCredentials: true })
      set({ agentMessages: response.data })
    } catch (error) {
      console.error('Failed to fetch agent messages:', error)
    }
  },

  sendAgentMessage: async (content, currentTripId, intent) => {
    const { activeAgentSessionId } = get()
    if (!activeAgentSessionId) return

    // Optimistically add user message
    const tempUserMsg: AgentMessage = {
      id: `temp-${Date.now()}`,
      sessionId: activeAgentSessionId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    const assistantId = `assistant-${Date.now()}`
    const placeholderAssistant: AgentMessage = {
      id: assistantId,
      sessionId: activeAgentSessionId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }

    set(state => ({
      agentMessages: [...state.agentMessages, tempUserMsg, placeholderAssistant],
      agentLoading: true,
    }))

    try {
      // Use fetch for SSE streaming (axios doesn't support streaming well)
      const response = await fetch(`${API_BASE_URL}/agent/sessions/${activeAgentSessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content, currentTripId, intent }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Check if it's a JSON response (blocked by intent) or structured event stream
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        // Blocked message (harmful/off_topic) — comes back as plain JSON
        const data = await response.json()
        set(state => ({
          agentMessages: state.agentMessages.map(m =>
            m.id === assistantId
              ? { ...m, content: data.content, metadata: data.metadata }
              : m
          ),
          agentLoading: false,
        }))
        return
      }

      // Structured event stream — parse newline-delimited JSON
      if (!response.body) throw new Error('Response body is empty')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let textContent = ''
      let metadata: Record<string, any> = {}
      const toolSteps: NonNullable<AgentMessage['toolSteps']> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let event: any
          try { event = JSON.parse(trimmed) } catch { continue }

          if (event.type === 'token') {
            textContent += event.content
          } else if (event.type === 'title') {
            set(state => ({
              agentSessions: state.agentSessions.map(s =>
                s.id === activeAgentSessionId ? { ...s, title: event.title } : s
              ),
            }))
          } else if (event.type === 'tool_start') {
            toolSteps.push({
              tool: event.tool,
              toolCallId: event.toolCallId,
              status: 'running',
              input: event.input,
            })
          } else if (event.type === 'tool_end') {
            const step = toolSteps.find(s => s.toolCallId === event.toolCallId)
            if (step) {
              step.status = 'done'
              step.output = event.output
            } else {
              toolSteps.push({ tool: event.tool, toolCallId: event.toolCallId, status: 'done', output: event.output })
            }
          } else if (event.type === 'meta') {
            metadata = event.data || {}
          }
        }

        // Update message with current state
        set(state => ({
          agentMessages: state.agentMessages.map(m =>
            m.id === assistantId
              ? { ...m, content: textContent, toolSteps: [...toolSteps] }
              : m
          ),
        }))
      }

      // Final update
      set(state => ({
        agentMessages: state.agentMessages.map(m =>
          m.id === assistantId
            ? { ...m, content: textContent, metadata, toolSteps: [...toolSteps] }
            : m
        ),
        agentLoading: false,
        agentSuggestedPlaces: metadata.suggestedPlaces || state.agentSuggestedPlaces,
        agentIntent: metadata.intent || state.agentIntent,
      }))

      if (metadata.tripId) {
        window.dispatchEvent(new CustomEvent('agent:navigateTrip', {
          detail: { tripId: metadata.tripId }
        }))
        get().fetchTrips()
      }
      if (metadata.modifiedTripId) {
        get().fetchTripById(metadata.modifiedTripId)
        set({ allPlacesCache: null, allPlacesCacheTime: 0 })
      }
      if (metadata.dayPlan) {
        const { currentTrip } = get()
        if (currentTrip) {
          get().fetchTripById(currentTrip.id)
        }
      }
    } catch (error) {
      console.error('Failed to send agent message:', error)
      set(state => ({
        agentMessages: state.agentMessages.map(m =>
          m.id === assistantId
            ? { ...m, content: '抱歉，处理消息时出现错误，请重试。', metadata: { ...m.metadata, error: true } }
            : m
        ),
        agentLoading: false,
      }))
    }
  },

  setAgentPanelOpen: (open) => set({ isAgentPanelOpen: open }),
  clearSuggestedPlaces: () => set({ agentSuggestedPlaces: null }),
  setAgentPlanRoutes: (routes) => set({ agentPlanRoutes: routes }),

  addSuggestedPlaceToTrip: async (place, dayIndex) => {
    const { currentTrip, activeDayIndex } = get()
    if (!currentTrip) {
      alert('请先打开一个行程')
      return
    }

    const targetDay = dayIndex ?? activeDayIndex
    const newDays = [...currentTrip.days]
    let day = newDays.find(d => d.dayIndex === targetDay)
    if (!day) {
      day = { dayIndex: targetDay, items: [] }
      newDays.push(day)
    }

    day.items.push({
      id: genId(),
      type: 'place',
      name: place.name,
      lngLat: place.lngLat,
      description: place.description || '',
      category: place.category || '',
      address: place.address || '',
      rating: place.rating || '',
      ticket: place.ticket || '',
      openingHours: place.openingHours || '',
      phone: place.phone || '',
      notes: place.notes || '',
    })

    await get().updateCurrentTrip({ days: newDays })
    await get().autoRecalculateRoutes(targetDay)
  },
}))
