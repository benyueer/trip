import React, { useEffect, useState, useRef } from 'react'
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
  const { fetchTripById, currentTrip, loading, user, setAgentPanelOpen, isAgentPanelOpen, updateCurrentTrip, isGuest } = useTripStore()
  const [showShareModal, setShowShareModal] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
  const descInputRef = useRef<HTMLTextAreaElement>(null)
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map')


  const startEditDesc = () => {
    setDescValue(currentTrip?.description || '')
    setEditingDesc(true)
    setTimeout(() => descInputRef.current?.focus(), 0)
  }

  const saveDesc = async () => {
    if (descValue !== (currentTrip?.description || '')) {
      await updateCurrentTrip({ description: descValue })
    }
    setEditingDesc(false)
  }

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

  useEffect(() => {
    const handleFocusPlace = () => {
      setMobileView('map')
    }
    window.addEventListener('agent:focusPlace', handleFocusPlace)
    return () => window.removeEventListener('agent:focusPlace', handleFocusPlace)
  }, [])

  const isOwner = currentTrip && user && (currentTrip as any).ownerId === user.id && !isGuest

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
    <div className='w-screen h-[100dvh] md:w-full md:h-full flex flex-col md:relative overflow-hidden bg-gray-50 font-sans' style={{ overscrollBehavior: 'none' }}>
      {/* 移动端导航栏 - 使用普通流在移动端占位，避免遮挡地图 */}
      <div className='md:hidden h-16 bg-white border-b border-gray-100 shadow-sm flex items-center justify-between px-4 z-20 shrink-0'>
        <button
          onClick={() => navigate('/')}
          className='p-2 hover:bg-gray-100 rounded-xl transition-all active:scale-95 text-gray-700 cursor-pointer'
        >
          <ArrowLeft size={22} />
        </button>
        
        {/* 移动端 地图/列表 切换分段按钮 */}
        <div className='flex bg-gray-100 p-0.5 rounded-xl border border-gray-200/30 shrink-0 mx-2 shadow-inner'>
          <button
            onClick={() => setMobileView('map')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              mobileView === 'map'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            地图
          </button>
          <button
            onClick={() => setMobileView('list')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              mobileView === 'list'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            列表
          </button>
        </div>

        <div className='flex items-center gap-1 shrink-0'>
          {!isGuest && (
            <button
              onClick={() => setAgentPanelOpen(true)}
              className='p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-all active:scale-95 cursor-pointer'
              title='旅行助手'
            >
              <Bot size={22} />
            </button>
          )}
          {isOwner && (
            <button
              onClick={() => setShowShareModal(true)}
              className='p-2 hover:bg-gray-100 text-gray-700 rounded-xl transition-all active:scale-95 cursor-pointer'
              title='分享行程'
            >
              <Share2 size={22} />
            </button>
          )}
        </div>
      </div>

      {/* 主体内容区，移动端下高为 flex-1 填满剩余高度，防止溢出 */}
      <div className='flex-1 relative overflow-hidden w-full h-full'>
        {/* 桌面端返回按钮 */}
        <button
          onClick={() => navigate('/')}
          className='absolute top-6 left-6 z-10 bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white hover:bg-white transition-all active:scale-95 flex items-center justify-center text-gray-700 hidden md:flex cursor-pointer'
        >
          <ArrowLeft size={24} />
        </button>

        {/* 桌面端分享按钮 */}
        {isOwner && (
          <button
            onClick={() => setShowShareModal(true)}
            className='absolute top-6 right-6 z-10 bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white hover:bg-white transition-all active:scale-95 flex items-center justify-center text-gray-700 hidden md:flex cursor-pointer'
          >
            <Share2 size={24} />
          </button>
        )}

        <MapContainer />
        <FloatingPanel mobileView={mobileView} setMobileView={setMobileView} />
        <PlaceModal />
        <ShareModal
          tripId={id!}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
        />

        {/* 桌面端行程标题与编辑描述面板 */}
        <div className='absolute top-6 left-24 z-10 bg-white/80 backdrop-blur-md px-6 py-3 rounded-2xl shadow-lg border border-white max-w-sm hidden md:block'>
          <h1 className='text-lg font-bold text-gray-900'>{currentTrip.title}</h1>
          {editingDesc && !isGuest ? (
            <div className='mt-1.5'>
              <textarea
                ref={descInputRef}
                value={descValue}
                onChange={e => setDescValue(e.target.value)}
                onBlur={saveDesc}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDesc() }
                  if (e.key === 'Escape') setEditingDesc(false)
                }}
                className='w-full text-xs text-gray-700 bg-gray-50/80 border-0 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400/40 resize-none placeholder:text-gray-300 transition-shadow'
                rows={2}
                placeholder='添加行程描述...'
              />
              <p className='text-[10px] text-gray-300 mt-1 select-none'>Enter 保存 · Esc 取消</p>
            </div>
          ) : (
            <p
              onClick={!isGuest ? startEditDesc : undefined}
              className={`text-xs text-gray-500 mt-0.5 ${!isGuest ? 'cursor-text hover:text-gray-700' : ''} transition-colors line-clamp-2`}
              title={!isGuest ? '点击编辑描述' : undefined}
            >
              {currentTrip.description || (isGuest ? '' : '点击添加描述...')}
            </p>
          )}
        </div>

        {!isAgentPanelOpen && !isGuest && (
          <button
            onClick={() => setAgentPanelOpen(true)}
            className='fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hidden md:flex items-center justify-center group z-30 animate-pulse cursor-pointer'
            style={{ animationDuration: '3s' }}
          >
            <Bot className='w-6 h-6 text-white group-hover:scale-110 transition-transform' />
          </button>
        )}
      </div>
    </div>
  )
}

export default TripDetailPage
