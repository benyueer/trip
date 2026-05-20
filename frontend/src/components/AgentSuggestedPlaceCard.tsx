import { motion } from 'framer-motion'
import { Star, Ticket, Plus, Check } from 'lucide-react'
import { useState } from 'react'
import { useTripStore } from '../store'

interface Props {
  index: number
  name: string
  lngLat: [number, number]
  description?: string
  category?: string
  rating?: string
  address?: string
  ticket?: string
}

export function AgentSuggestedPlaceCard({ index, name, lngLat, description, category, rating, address, ticket }: Props) {
  const { addSuggestedPlaceToTrip, currentTrip } = useTripStore()
  const [added, setAdded] = useState(false)

  const handleFocusMap = () => {
    window.dispatchEvent(new CustomEvent('agent:focusPlace', { detail: { lngLat, name } }))
  }

  const handleMouseEnter = () => {
    window.dispatchEvent(new CustomEvent('agent:cardHover', { detail: { index, isHover: true } }))
  }

  const handleMouseLeave = () => {
    window.dispatchEvent(new CustomEvent('agent:cardHover', { detail: { index, isHover: false } }))
  }

  const handleAddToTrip = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentTrip) {
      alert('请先打开一个行程再添加地点')
      return
    }
    addSuggestedPlaceToTrip({ name, lngLat, description, category, address, rating, ticket })
    setAdded(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-3 hover:shadow-md transition-all cursor-pointer"
      onClick={handleFocusMap}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">{index + 1}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-gray-900 truncate">{name}</h4>
          {category && (
            <span className="text-xs text-gray-500">{category}</span>
          )}
          {rating && (
            <div className="flex items-center gap-1 mt-0.5">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              <span className="text-xs text-gray-600">{rating}</span>
            </div>
          )}
          {address && (
            <p className="text-xs text-gray-400 mt-1 truncate">{address}</p>
          )}
          {ticket && (
            <div className="flex items-center gap-1 mt-0.5">
              <Ticket className="w-3 h-3 text-green-500" />
              <span className="text-xs text-green-600">{ticket}</span>
            </div>
          )}
        </div>
        <button
          className={`p-1.5 rounded-lg transition-all ${
            added
              ? 'bg-green-500 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
          title={added ? '已添加' : '添加到行程'}
          onClick={handleAddToTrip}
          disabled={added}
        >
          {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>
    </motion.div>
  )
}
