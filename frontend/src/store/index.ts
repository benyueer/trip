import { create } from 'zustand'
import axios from 'axios'

const API_BASE_URL = 'http://localhost:3001/api'

export type ItemType = 'place' | 'route'

export interface Place {
  id: string
  type: 'place'
  name: string
  description?: string
  ticket?: string
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
  items: TripItem[]
}

export interface Trip {
  id: string
  title: string
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

export interface TripState {
  trips: Trip[]
  currentTrip: Trip | null
  highlightedId: string | null
  activeDayIndex: number
  loading: boolean
  isEditMode: boolean
  editingItem: EditingItem | null
  
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
  
  addPlace: (dayIndex: number, place: Place) => void
  updatePlace: (dayIndex: number, placeId: string, name: string, description?: string, ticket?: string) => void
  deleteItem: (dayIndex: number, itemId: string) => void
  addRoute: (dayIndex: number, route: Route) => void
  calculateAndAddRoute: (dayIndex: number, startPlace: Place, endPlace: Place, mode: string) => Promise<void>
  reorderItems: (dayIndex: number, newItems: TripItem[]) => void
  moveItem: (fromDayIndex: number, toDayIndex: number, itemId: string) => void

  // Routing State
  isRouting: boolean
  routingStartItem: Place | null
  routingEndItem: Place | null
  startRouting: () => void
  cancelRouting: () => void
  setRoutingStart: (item: Place) => void
  setRoutingEnd: (item: Place) => void
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  currentTrip: null,
  highlightedId: null,
  activeDayIndex: 1,
  loading: false,
  isEditMode: false,
  editingItem: null,

  fetchTrips: async () => {
    set({ loading: true })
    try {
      const response = await axios.get(`${API_BASE_URL}/trips`)
      set({ trips: response.data, loading: false })
    } catch (error) {
      console.error('Failed to fetch trips:', error)
      set({ loading: false })
    }
  },

  fetchTripById: async (id) => {
    set({ loading: true })
    try {
      const response = await axios.get(`${API_BASE_URL}/trips/${id}`)
      set({ currentTrip: response.data, loading: false, activeDayIndex: 1 })
    } catch (error) {
      console.error('Failed to fetch trip:', error)
      set({ loading: false })
    }
  },

  createTrip: async (title) => {
    try {
      await axios.post(`${API_BASE_URL}/trips`, { title })
      get().fetchTrips()
    } catch (error) {
      console.error('Failed to create trip:', error)
    }
  },

  deleteTrip: async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/trips/${id}`)
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
      })
      set({ currentTrip: response.data })
    } catch (error) {
      console.error('Failed to update trip:', error)
    }
  },

  setHighlightedId: (id) => set({ highlightedId: id }),
  
  setActiveDayIndex: (activeDayIndex) => set({ activeDayIndex }),
  
  setIsEditMode: (isEditMode) => set({ isEditMode, highlightedId: null, editingItem: null }),
  
  setEditingItem: (editingItem) => set({ editingItem }),

  addPlace: (dayIndex, place) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    const newDays = [...currentTrip.days]
    let day = newDays.find(d => d.dayIndex === dayIndex)
    if (!day) {
      day = { dayIndex, items: [] }
      newDays.push(day)
    }
    day.items.push(place)
    
    get().updateCurrentTrip({ days: newDays })
  },

  updatePlace: (dayIndex, placeId, name, description, ticket) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    const newDays = currentTrip.days.map(day => {
      if (day.dayIndex === dayIndex) {
        return {
          ...day,
          items: day.items.map(item => {
            if (item.id === placeId) {
              return { ...item, name, description, ticket }
            }
            return item
          })
        }
      }
      return day
    })
    
    get().updateCurrentTrip({ days: newDays })
  },

  deleteItem: (dayIndex, itemId) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    const newDays = currentTrip.days.map(day => {
      if (day.dayIndex === dayIndex) {
        return {
          ...day,
          items: day.items.filter(item => item.id !== itemId)
        }
      }
      return day
    })
    
    get().updateCurrentTrip({ days: newDays })
  },

  calculateAndAddRoute: async (dayIndex: number, startPlace: Place, endPlace: Place, mode: string) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    set({ loading: true })
    try {
      const modeName = mode === 'Driving' ? '驾车' : mode === 'Walking' ? '步行' : '骑行'
      const name = `${startPlace.name} 到 ${endPlace.name} (${modeName})`
      
      const response = await axios.post(`${API_BASE_URL}/trips/${currentTrip.id}/days/${dayIndex}/routes`, {
        routeId: crypto.randomUUID(),
        startLngLat: startPlace.lngLat,
        endLngLat: endPlace.lngLat,
        mode,
        name
      })
      
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
  reorderItems: (dayIndex, newItems) => {
    const { currentTrip } = get()
    if (!currentTrip) return

    const newDays = currentTrip.days.map(day => {
      if (day.dayIndex === dayIndex) {
        return { ...day, items: newItems }
      }
      return day
    })

    get().updateCurrentTrip({ days: newDays })
  },

  // 将某个条目从一天移动到另一天
  moveItem: (fromDayIndex, toDayIndex, itemId) => {
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

    get().updateCurrentTrip({ days: newDays })
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
  
  setRoutingEnd: (item) => set({ routingEndItem: item })
}))
