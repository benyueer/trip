import React, { useState } from 'react'
import { useTripStore } from '../store'
import { LogOut, ChevronDown } from 'lucide-react'

const UserAvatar: React.FC = () => {
  const { user, logout } = useTripStore()
  const [showMenu, setShowMenu] = useState(false)

  if (!user) return null

  return (
    <div className='relative'>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className='flex items-center gap-2 bg-white/80 backdrop-blur-md px-3 py-2 rounded-xl shadow-sm border border-gray-100 hover:bg-white transition-all'
      >
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} className='w-8 h-8 rounded-full object-cover' />
        ) : (
          <div className='w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm'>
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className='text-sm font-medium text-gray-700 hidden sm:block'>{user.name}</span>
        <ChevronDown size={14} className='text-gray-400' />
      </button>

      {showMenu && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => setShowMenu(false)} />
          <div className='absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50'>
            <div className='px-4 py-2 border-b border-gray-100'>
              <p className='text-sm font-medium text-gray-900'>{user.name}</p>
              <p className='text-xs text-gray-500'>{user.email}</p>
            </div>
            <button
              onClick={() => {
                setShowMenu(false)
                logout()
              }}
              className='w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors'
            >
              <LogOut size={16} />
              退出登录
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default UserAvatar
