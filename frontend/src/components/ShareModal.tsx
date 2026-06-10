import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { X, UserPlus, Trash2, Search } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

interface ShareUser {
  id: string
  email: string
  name: string
  avatar: string | null
}

interface ExistingShare {
  id: string
  userId: string
  permission: string
  user: ShareUser
}

interface ShareModalProps {
  tripId: string
  isOpen: boolean
  onClose: () => void
}

const ShareModal: React.FC<ShareModalProps> = ({ tripId, isOpen, onClose }) => {
  const [shares, setShares] = useState<ExistingShare[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ShareUser[]>([])
  const [selectedUser, setSelectedUser] = useState<ShareUser | null>(null)
  const [permission, setPermission] = useState('view')
  const [loading, setLoading] = useState(false)

  const fetchShares = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/trips/${tripId}/shares`, { withCredentials: true })
      setShares(res.data)
    } catch (error) {
      console.error('Failed to fetch shares:', error)
    }
  }, [tripId])

  useEffect(() => {
    if (isOpen) {
      fetchShares()
      setSearchQuery('')
      setSearchResults([])
      setSelectedUser(null)
    }
  }, [isOpen, fetchShares])

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/users/search?q=${searchQuery}`, { withCredentials: true })
        setSearchResults(res.data)
      } catch (error) {
        console.error('Failed to search users:', error)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleInvite = async () => {
    if (!selectedUser) return
    setLoading(true)
    try {
      await axios.post(`${API_BASE_URL}/trips/${tripId}/shares`, {
        userId: selectedUser.id,
        permission,
      }, { withCredentials: true })
      setSelectedUser(null)
      setSearchQuery('')
      setSearchResults([])
      fetchShares()
    } catch (error: any) {
      alert(error.response?.data?.error || '邀请失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (userId: string) => {
    try {
      await axios.delete(`${API_BASE_URL}/trips/${tripId}/shares/${userId}`, { withCredentials: true })
      fetchShares()
    } catch (error) {
      console.error('Failed to remove share:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4' onClick={onClose}>
      <div 
        className='bg-white rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-lg mx-4 flex flex-col max-h-[90vh]'
        onClick={e => e.stopPropagation()}
      >
        <div className='flex justify-between items-center mb-6 shrink-0'>
          <h2 className='text-xl font-bold text-gray-900'>分享行程</h2>
          <button onClick={onClose} className='p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer'>
            <X size={20} />
          </button>
        </div>

        <div className='overflow-y-auto flex-1 space-y-6 pr-1'>
          {/* Search and invite */}
          <div>
            <div className='relative'>
              <Search size={18} className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400' />
              <input
                type='text'
                value={selectedUser ? selectedUser.email : searchQuery}
                onChange={(e) => {
                  setSelectedUser(null)
                  setSearchQuery(e.target.value)
                }}
                placeholder='搜索邮箱来邀请用户...'
                disabled={!!selectedUser}
                className='w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all disabled:opacity-50 text-sm sm:text-base'
              />
            </div>

            {/* Search results dropdown */}
            {searchResults.length > 0 && !selectedUser && (
              <div className='mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10 relative'>
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user)
                      setSearchResults([])
                    }}
                    className='w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left cursor-pointer'
                  >
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className='w-8 h-8 rounded-full' />
                    ) : (
                      <div className='w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold'>
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className='text-sm font-medium text-gray-900'>{user.name}</p>
                      <p className='text-xs text-gray-500'>{user.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Permission selector and invite button */}
            {selectedUser && (
              <div className='mt-3 flex items-center gap-3'>
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  className='px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none'
                >
                  <option value='view'>仅查看</option>
                  <option value='edit'>可编辑</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={loading}
                  className='flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 cursor-pointer'
                >
                  <UserPlus size={16} />
                  {loading ? '邀请中...' : '邀请'}
                </button>
                <button
                  onClick={() => {
                    setSelectedUser(null)
                    setSearchQuery('')
                  }}
                  className='text-sm text-gray-500 hover:text-gray-700 cursor-pointer'
                >
                  取消
                </button>
              </div>
            )}
          </div>

          {/* Existing shares */}
          <div>
            <h3 className='text-sm font-medium text-gray-500 mb-3'>已分享给</h3>
            {shares.length === 0 ? (
              <p className='text-sm text-gray-400'>暂无分享</p>
            ) : (
              <div className='space-y-2'>
                {shares.map((share) => (
                  <div key={share.id} className='flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg'>
                    <div className='flex items-center gap-3'>
                      {share.user.avatar ? (
                        <img src={share.user.avatar} alt={share.user.name} className='w-8 h-8 rounded-full' />
                      ) : (
                        <div className='w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold'>
                          {share.user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className='text-sm font-medium text-gray-900'>{share.user.name}</p>
                        <p className='text-xs text-gray-500'>{share.user.email}</p>
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <span className='text-xs text-gray-400'>
                        {share.permission === 'edit' ? '可编辑' : '仅查看'}
                      </span>
                      <button
                        onClick={() => handleRemove(share.userId)}
                        className='p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer'
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShareModal
