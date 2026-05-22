import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Check, X, Clock, Navigation } from 'lucide-react'
import { useTripStore } from '../store'

interface Place {
  name: string
  lngLat: [number, number]
  description?: string
  category?: string
  address?: string
  rating?: string
  ticket?: string
  openingHours?: string
  phone?: string
  notes?: string
  order: number
}

interface DayPlan {
  dayIndex: number
  title: string
  description?: string
  places: Place[]
  routeInfo?: {
    totalDistance: string
    totalDuration: string
  }
  routes?: Array<{
    distance: string
    duration: string
    path: [number, number][]
  }>
}

interface Props {
  plan: DayPlan
  onAccept?: () => void
  onReject?: () => void
}

export function AgentDayPlanCard({ plan, onAccept, onReject }: Props) {
  const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected'>('pending')
  const { currentTrip, updateCurrentTrip } = useTripStore()

  const handleAccept = () => {
    if (!currentTrip) {
      alert('请先打开一个行程')
      return
    }
    const newDays = [...currentTrip.days]
    let day = newDays.find(d => d.dayIndex === plan.dayIndex)
    if (!day) {
      day = { dayIndex: plan.dayIndex, items: [] }
      newDays.push(day)
    }
    for (const place of plan.places) {
      day.items.push({
        id: crypto.randomUUID(),
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
    }
    updateCurrentTrip({ days: newDays })
    useTripStore.getState().setAgentPlanRoutes(null)
    useTripStore.setState({ agentSuggestedPlaces: null })
    setStatus('accepted')
    onAccept?.()
  }

  const handleReject = () => {
    useTripStore.getState().setAgentPlanRoutes(null)
    useTripStore.setState({ agentSuggestedPlaces: null })
    setStatus('rejected')
    onReject?.()
  }

  // Sync plan places and routes to map on mount
  useEffect(() => {
    // Set suggested places for map markers
    useTripStore.setState({
      agentSuggestedPlaces: plan.places.map(p => ({
        name: p.name,
        lngLat: p.lngLat,
        description: p.description,
        category: p.category,
        address: p.address,
        rating: p.rating,
        ticket: p.ticket,
        openingHours: p.openingHours,
      }))
    })

    // Set plan routes for map polylines
    if (plan.routes && plan.routes.length > 0) {
      useTripStore.getState().setAgentPlanRoutes(plan.routes)
    }

    // Fit map to show all places
    if (plan.places.length > 0) {
      const allLngLats = plan.places.map(p => p.lngLat)
      window.dispatchEvent(new CustomEvent('agent:fitPlanView', {
        detail: { lngLats: allLngLats }
      }))
    }

    // Cleanup on unmount
    return () => {
      useTripStore.getState().setAgentPlanRoutes(null)
      useTripStore.setState({ agentSuggestedPlaces: null })
    }
  }, [plan])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl overflow-hidden"
    >
      <div className="px-4 py-3 bg-indigo-100/50 border-b border-indigo-200/50">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-indigo-600" />
          <h4 className="font-semibold text-sm text-indigo-900">{plan.title}</h4>
        </div>
        {plan.description && (
          <p className="text-xs text-indigo-600 mt-0.5">{plan.description}</p>
        )}
      </div>

      <div className="px-4 py-3 space-y-2">
        {plan.places.map((place, i) => (
          <div
            key={i}
            className="flex items-start gap-2 cursor-pointer hover:bg-white/50 rounded-lg p-1.5 -mx-1.5 transition-colors"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('agent:focusPlace', {
                detail: { lngLat: place.lngLat, name: place.name }
              }))
            }}
          >
            <div className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
              {place.order}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{place.name}</p>
              {place.description && (
                <p className="text-xs text-gray-500 mt-0.5">{place.description}</p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                {place.category && (
                  <span className="text-xs text-gray-400">{place.category}</span>
                )}
                {place.ticket && (
                  <span className="text-xs text-green-600">{place.ticket}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {plan.routeInfo && (
        <div className="px-4 py-2 border-t border-indigo-100 flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            {plan.routeInfo.totalDuration}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="w-3 h-3" />
            {plan.routeInfo.totalDistance}
          </div>
        </div>
      )}

      {status === 'pending' && (
        <div className="px-4 py-3 bg-indigo-50/50 border-t border-indigo-100 flex gap-2">
          <button
            onClick={handleAccept}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            <Check className="w-4 h-4" />
            接受方案
          </button>
          <button
            onClick={handleReject}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <X className="w-4 h-4" />
            重新规划
          </button>
        </div>
      )}

      {status === 'accepted' && (
        <div className="px-4 py-3 bg-green-50 border-t border-green-100 flex items-center gap-2">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-700 font-medium">已接受，地点已添加到行程</span>
        </div>
      )}

      {status === 'rejected' && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
          <X className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">已拒绝，请告诉我想怎么调整</span>
        </div>
      )}
    </motion.div>
  )
}
