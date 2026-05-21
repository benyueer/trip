import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTripStore } from '../store'
import MapContainer from '../components/MapContainer'
import FloatingPanel from '../components/FloatingPanel'
import PlaceModal from '../components/PlaceModal'
import ShareModal from '../components/ShareModal'
import { ArrowLeft, Loader2, Share2, Bot } from 'lucide-react'

const TripDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fetchTripById, currentTrip, loading, user, setAgentPanelOpen, isAgentPanelOpen } = useTripStore()
  const [showShareModal, setShowShareModal] = useState(false)

  useEffect(() => {
    if (id) {
      fetchTripById(id)
    }
  }, [id])

  useEffect(() => {
    const handleNavigate = (e: CustomEvent) => {
      const { tripId } = e.detail
      if (tripId) {
        navigate(`/trip/${tripId}`)
      }
    }

    window.addEventListener('agent:navigateTrip', handleNavigate as EventListener)
    return () => window.removeEventListener('agent:navigateTrip', handleNavigate as EventListener)
  }, [navigate])

  const isOwner = currentTrip && user && (currentTrip as any).ownerId === user.id

  if (loading && currentTrip?.id !== id) {
    return (
      <div className='w-screen h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-400'>
        <Loader2 className='animate-spin mb-4' size={48} />
        <p className='text-lg'>加载行程详情...</p>
      </div>
    )
  }

  if (!currentTrip) {
    return (
      <div className='w-screen h-screen flex flex-col items-center justify-center bg-gray-50'>
        <p className='text-gray-500 mb-4'>未找到行程</p>
        <button
          onClick={() => navigate('/')}
          className='text-blue-600 font-semibold flex items-center gap-2 hover:underline'
        >
          <ArrowLeft size={20} />
          返回列表
        </button>
      </div>
    )
  }

  return (
    <div className='w-full h-full relative overflow-hidden bg-gray-50 font-sans'>
      <button
        onClick={() => navigate('/')}
        className='absolute top-6 left-6 z-10 bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white hover:bg-white transition-all active:scale-95 flex items-center justify-center text-gray-700'
      >
        <ArrowLeft size={24} />
      </button>

      {isOwner && (
        <button
          onClick={() => setShowShareModal(true)}
          className='absolute top-6 right-6 z-10 bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white hover:bg-white transition-all active:scale-95 flex items-center justify-center text-gray-700'
        >
          <Share2 size={24} />
        </button>
      )}

      <MapContainer />
      <FloatingPanel />
      <PlaceModal />
      <ShareModal
        tripId={id!}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />

      <div className='absolute top-6 left-24 z-10 bg-white/80 backdrop-blur-md px-6 py-3 rounded-2xl shadow-lg border border-white'>
        <h1 className='text-lg font-bold text-gray-900'>{currentTrip.title}</h1>
      </div>

      {!isAgentPanelOpen && (
        <button
          onClick={() => setAgentPanelOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group z-30 animate-pulse"
          style={{ animationDuration: '3s' }}
        >
          <Bot className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
        </button>
      )}
    </div>
  )
}

export default TripDetailPage
