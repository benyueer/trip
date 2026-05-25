import { motion } from 'framer-motion'
import { Star, Ticket, Plus, Check, MapPin, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTripStore } from '../store'

interface Place {
  name: string
  lngLat: [number, number]
  description?: string
  category?: string
  rating?: string
  address?: string
  ticket?: string
}

interface Props {
  places: Place[]
}

export function AgentPlaceListCard({ places }: Props) {
  const { addSuggestedPlaceToTrip, currentTrip } = useTripStore()
  const [addedSet, setAddedSet] = useState<Set<number>>(new Set())

  const handleFocusMap = (place: Place) => {
    window.dispatchEvent(new CustomEvent('agent:focusPlace', { detail: { lngLat: place.lngLat, name: place.name } }))
  }

  const handleMouseEnter = (index: number) => {
    window.dispatchEvent(new CustomEvent('agent:cardHover', { detail: { index, isHover: true } }))
  }

  const handleMouseLeave = (index: number) => {
    window.dispatchEvent(new CustomEvent('agent:cardHover', { detail: { index, isHover: false } }))
  }

  const handleAddToTrip = (e: React.MouseEvent, place: Place, index: number) => {
    e.stopPropagation()
    if (!currentTrip) {
      alert('请先打开一个行程再添加地点')
      return
    }
    addSuggestedPlaceToTrip(place)
    setAddedSet(prev => new Set(prev).add(index))
  }

  if (places.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 bg-white/90 backdrop-blur-sm border border-gray-200/80 rounded-2xl overflow-hidden shadow-sm"
    >
      {/* Header */}
      <div className="px-3.5 py-2 border-b border-gray-100 flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-xs font-semibold text-gray-600">
          找到 {places.length} 个地点
        </span>
      </div>

      {/* Place list */}
      <div className="divide-y divide-gray-100">
        {places.map((place, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.04 }}
            className="px-3.5 py-2.5 flex items-start gap-2.5 cursor-pointer hover:bg-gray-50/80 transition-colors group"
            onClick={() => handleFocusMap(place)}
            onMouseEnter={() => handleMouseEnter(i)}
            onMouseLeave={() => handleMouseLeave(i)}
          >
            {/* Index badge */}
            <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-blue-100 transition-colors">
              <span className="text-[10px] font-bold text-blue-600">{i + 1}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-900 truncate">{place.name}</span>
                {place.rating && (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-600 shrink-0">
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                    {place.rating}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {place.category && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{place.category}</span>
                )}
                {place.address && (
                  <span className="text-[10px] text-gray-400 truncate">{place.address}</span>
                )}
              </div>
              {place.description && (
                <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{place.description}</p>
              )}
            </div>

            {/* Add button */}
            <button
              className={`p-1.5 rounded-lg transition-all shrink-0 mt-0.5 ${
                addedSet.has(i)
                  ? 'bg-green-500 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white opacity-0 group-hover:opacity-100'
              }`}
              title={addedSet.has(i) ? '已添加' : '添加到行程'}
              onClick={e => handleAddToTrip(e, place, i)}
              disabled={addedSet.has(i)}
            >
              {addedSet.has(i)
                ? <Check className="w-3 h-3" />
                : <Plus className="w-3 h-3" />
              }
            </button>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
