import React, { useEffect, useState } from 'react'
import { useTripStore } from '../store'
import { Plus, Trash2, Calendar, ChevronRight, Loader2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import LoginModal from '../components/LoginModal'
import UserAvatar from '../components/UserAvatar'

const PlanningListPage: React.FC = () => {
  const { trips, fetchTrips, createTrip, deleteTrip, loading, isAuthenticated, authChecked, fetchMe } = useTripStore()
  const [newTripTitle, setNewTripTitle] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchMe()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchTrips()
    }
  }, [isAuthenticated])

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

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <Loader2 className='animate-spin text-gray-400' size={40} />
      </div>
    )
  }

  // Show login modal if not authenticated
  if (!isAuthenticated) {
    return <LoginModal />
  }

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTripTitle.trim()) return
    await createTrip(newTripTitle)
    setNewTripTitle('')
    setIsAdding(false)
  }

  return (
    <div className='min-h-screen bg-gray-50 p-8'>
      <div className='max-w-4xl mx-auto'>
        <header className='flex justify-between items-center mb-12'>
          <div>
            <h1 className='text-4xl font-bold text-gray-900 mb-2'>行程规划</h1>
            <p className='text-gray-500'>探索世界，从一个完美的计划开始。</p>
          </div>
          <div className='flex items-center gap-4'>
            <UserAvatar />
            <button
              onClick={() => setIsAdding(true)}
              className='flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-200 active:scale-95'
            >
              <Plus size={20} />
              新建行程
            </button>
          </div>
        </header>

        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className='bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8'
            >
              <form onSubmit={handleCreateTrip} className='flex gap-4'>
                <input
                  autoFocus
                  type='text'
                  value={newTripTitle}
                  onChange={(e) => setNewTripTitle(e.target.value)}
                  placeholder='输入行程名称，例如：京都赏樱之旅'
                  className='flex-1 px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all outline-none'
                />
                <button
                  type='submit'
                  className='bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-all'
                >
                  确认创建
                </button>
                <button
                  type='button'
                  onClick={() => setIsAdding(false)}
                  className='px-6 py-3 text-gray-500 hover:text-gray-700 font-semibold'
                >
                  取消
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className='flex flex-col items-center justify-center py-20 text-gray-400'>
            <Loader2 className='animate-spin mb-4' size={40} />
            <p>加载行程中...</p>
          </div>
        ) : (
          <div className='grid gap-6'>
            {trips.length === 0 ? (
              <div className='text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100'>
                <p className='text-gray-400 mb-4'>还没有任何行程</p>
                <button
                  onClick={() => setIsAdding(true)}
                  className='text-blue-600 font-semibold hover:underline'
                >
                  立即创建一个吧
                </button>
              </div>
            ) : (
              trips.map((trip) => (
                <motion.div
                  layout
                  key={trip.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className='group relative bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100'
                >
                  <div className='flex justify-between items-center'>
                    <Link to={`/trip/${trip.id}`} className='flex-1 flex items-center gap-6'>
                      <div className='w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors'>
                        <Calendar size={32} />
                      </div>
                      <div>
                        <h3 className='text-xl font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors'>
                          {trip.title}
                        </h3>
                        <p className='text-sm text-gray-400 flex items-center gap-1'>
                          创建于 {new Date(trip.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </Link>
                    <div className='flex items-center gap-4'>
                      <button
                        onClick={() => deleteTrip(trip.id)}
                        className='p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all rounded-xl'
                      >
                        <Trash2 size={20} />
                      </button>
                      <Link
                        to={`/trip/${trip.id}`}
                        className='p-3 text-gray-300 group-hover:text-blue-600 transition-all'
                      >
                        <ChevronRight size={24} />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PlanningListPage
