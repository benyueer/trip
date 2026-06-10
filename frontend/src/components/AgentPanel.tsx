import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Plus, Trash2, Loader2, Bot, User, MapPin, ArrowLeft, MessageSquare, Pencil } from 'lucide-react'
import { useTripStore } from '../store'
import { AgentPlaceListCard } from './AgentPlaceListCard'
import { AgentDayPlanCard } from './AgentDayPlanCard'
import { AgentToolCallCard } from './AgentToolCallCard'
import ReactMarkdown from 'react-markdown'

export function AgentPanel() {
  const {
    isAgentPanelOpen,
    setAgentPanelOpen,
    agentSessions,
    activeAgentSessionId,
    agentMessages,
    agentLoading,
    fetchAgentSessions,
    createAgentSession,
    updateAgentSession,
    deleteAgentSession,
    setActiveAgentSession,
    sendAgentMessage,
    currentTrip,
  } = useTripStore()

  const [input, setInput] = useState('')
  const [view, setView] = useState<'list' | 'chat'>('list')
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [isMinimized, setIsMinimized] = useState(false)

  const [selectedIntent, setSelectedIntent] = useState<'import_itinerary' | 'place_search' | 'trip_planner'>('place_search')
  const [isIntentDropdownOpen, setIsIntentDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const intents = [
    { value: 'place_search', label: '地点探索', desc: '发现并推荐目的地或景点', color: 'from-blue-500 to-indigo-600', placeholder: '搜索你想探索的目的地/景点，如“新疆有哪些草原？”' },
    { value: 'trip_planner', label: '单日规划', desc: '深度规划单日路线与景点', color: 'from-purple-500 to-pink-600', placeholder: '输入你想规划的一天，如“帮我规划一天在杭州西湖的深度游”' },
    { value: 'import_itinerary', label: '使用已有行程', desc: '快速解析并导入多日行程', color: 'from-emerald-500 to-teal-600', placeholder: '输入已有的粗略行程以自动规划导入，格式如“第一天：成都-雅安-康定”' }
  ] as const

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsIntentDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 移动端下点击定位时，自动将 AI 对话最小化为气泡，避免遮挡地图
  useEffect(() => {
    const handleFocusPlace = () => {
      if (isMobile) {
        setIsMinimized(true)
      }
    }
    window.addEventListener('agent:focusPlace', handleFocusPlace)
    return () => window.removeEventListener('agent:focusPlace', handleFocusPlace)
  }, [isMobile])

  // 当面板开关状态变化时重置最小化状态
  useEffect(() => {
    if (!isAgentPanelOpen) {
      setIsMinimized(false)
    }
  }, [isAgentPanelOpen])

  // On panel open: fetch sessions, restore last active session
  useEffect(() => {
    if (isAgentPanelOpen) {
      fetchAgentSessions().then(() => {
        const savedId = localStorage.getItem('agent_active_session_id')
        if (savedId) {
          setActiveAgentSession(savedId)
          setView('chat')
        }
      })
    }
  }, [isAgentPanelOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentMessages])

  const handleSend = async () => {
    if (!input.trim() || agentLoading) return
    if (!activeAgentSessionId) {
      const id = await createAgentSession()
      if (!id) return
      await setActiveAgentSession(id)
      setView('chat')
    }
    setInput('')
    await sendAgentMessage(input.trim(), currentTrip?.id, selectedIntent)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewSession = async () => {
    const id = await createAgentSession('新对话')
    if (id) {
      await setActiveAgentSession(id)
      setView('chat')
    }
  }

  const handleSelectSession = (id: string) => {
    setActiveAgentSession(id)
    setView('chat')
  }

  const handleBackToList = () => {
    setView('list')
  }

  const handleStartEdit = (id: string, currentTitle: string) => {
    setEditingSessionId(id)
    setEditingTitle(currentTitle)
  }

  const handleSaveEdit = () => {
    if (editingSessionId && editingTitle.trim()) {
      updateAgentSession(editingSessionId, editingTitle.trim())
    }
    setEditingSessionId(null)
  }

  const handleCancelEdit = () => {
    setEditingSessionId(null)
  }

  useEffect(() => {
    if (editingSessionId) {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }
  }, [editingSessionId])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins} 分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} 小时前`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days} 天前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <AnimatePresence>
      {isAgentPanelOpen && (
        <motion.div
          initial={{ x: isMobile ? '100%' : 0, opacity: 0 }}
          animate={{ 
            width: isMobile ? '100%' : 420, 
            opacity: isMobile && isMinimized ? 0 : 1,
            x: isMobile && isMinimized ? '100%' : '0%'
          }}
          exit={{ x: isMobile ? '100%' : 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className={isMobile 
            ? 'fixed inset-0 z-50 bg-white flex flex-col overflow-hidden h-full' 
            : 'relative h-full bg-white border-l border-gray-200/50 flex flex-col overflow-hidden flex-shrink-0'
          }
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200/50">
            <div className="flex items-center gap-2">
              {view === 'chat' && (
                <button
                  onClick={handleBackToList}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors -ml-1"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </button>
              )}
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-sm text-gray-900">
                  {view === 'list' ? '旅行助手' : (agentSessions.find(s => s.id === activeAgentSessionId)?.title || '新对话')}
                </h2>
                <p className="text-xs text-gray-400">
                  {view === 'list' ? `${agentSessions.length} 个对话` : 'AI 行程规划'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isMobile && view === 'chat' && (
                <button
                  onClick={() => setIsMinimized(true)}
                  className="px-2.5 py-1 hover:bg-blue-50 text-xs font-bold text-blue-600 rounded-lg border border-blue-200 mr-1 flex items-center gap-1 cursor-pointer"
                >
                  查看地图
                </button>
              )}
              {view === 'list' && (
                <button
                  onClick={handleNewSession}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="新对话"
                >
                  <Plus className="w-4 h-4 text-gray-500" />
                </button>
              )}
              <button
                onClick={() => setAgentPanelOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Session List View */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto">
              {/* New conversation button */}
              <button
                onClick={handleNewSession}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100"
              >
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Plus className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-blue-600">开始新对话</span>
              </button>

              {agentSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageSquare className="w-10 h-10 text-gray-300 mb-3" />
                  <p className="text-sm text-gray-400">暂无对话记录</p>
                  <p className="text-xs text-gray-300 mt-1">点击上方按钮开始第一次对话</p>
                </div>
              ) : (
                agentSessions.map(session => (
                  <div
                    key={session.id}
                    className={`group flex items-center justify-between px-4 py-3 cursor-pointer transition-colors border-b border-gray-50 ${
                      session.id === activeAgentSessionId
                        ? 'bg-blue-50/60'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <div className="flex-1 min-w-0">
                      {editingSessionId === session.id ? (
                        <input
                          ref={editInputRef}
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit() }
                            if (e.key === 'Escape') handleCancelEdit()
                          }}
                          className="w-full text-sm font-medium text-gray-800 bg-white border border-blue-400 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-500/30"
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <p className="text-sm font-medium text-gray-800 truncate">{session.title}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(session.updatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                    {editingSessionId !== session.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartEdit(session.id, session.title)
                        }}
                        className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded-lg transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteAgentSession(session.id)
                      }}
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Chat View */}
          {view === 'chat' && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {agentMessages.length === 0 && !agentLoading && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center mb-4">
                      <Bot className="w-8 h-8 text-blue-500" />
                    </div>
                    <h3 className="font-medium text-gray-700 mb-1">你好！我是旅行助手</h3>
                    <p className="text-sm text-gray-400 max-w-[250px]">
                      可以帮你查询目的地、规划行程、推荐景点。试试问我"新疆有哪些草原"？
                    </p>
                  </div>
                )}

                {agentMessages.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-500 to-purple-600'
                        : 'bg-gradient-to-br from-gray-100 to-gray-200'
                    }`}>
                      {msg.role === 'user'
                        ? <User className="w-3.5 h-3.5 text-white" />
                        : <Bot className="w-3.5 h-3.5 text-gray-600" />
                      }
                    </div>
                    <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                      {/* Tool steps */}
                      {msg.role === 'assistant' && msg.toolSteps && msg.toolSteps.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          {msg.toolSteps.map((step) => (
                            <AgentToolCallCard key={step.toolCallId} step={step} />
                          ))}
                        </div>
                      )}

                      <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                          : msg.metadata?.error
                            ? 'bg-red-50 border border-red-200 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}>
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                            {agentLoading && msg.id === agentMessages[agentMessages.length - 1]?.id && (
                              <span className="inline-flex gap-0.5 ml-1 align-middle">
                                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </span>
                            )}
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>

                      {msg.metadata?.error && (
                        <div className="mt-1.5 text-left">
                          <button
                            onClick={async () => {
                              const idx = agentMessages.findIndex(m => m.id === msg.id)
                              const prevMsg = idx > 0 ? agentMessages[idx - 1] : null
                              if (prevMsg && prevMsg.role === 'user') {
                                await sendAgentMessage(prevMsg.content, currentTrip?.id, selectedIntent)
                              }
                            }}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-100/50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 inline-flex cursor-pointer"
                          >
                            <span>重新发送</span>
                          </button>
                        </div>
                      )}

                      {msg.metadata?.suggestedPlaces && msg.metadata.suggestedPlaces.length > 0 && (
                        <AgentPlaceListCard places={msg.metadata.suggestedPlaces} />
                      )}

                      {msg.metadata?.tripId && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="mt-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3 cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => {
                            window.location.href = `/trip/${msg.metadata?.tripId}`
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-green-800">
                              {msg.metadata?.tripTitle || '行程已生成'} - 点击查看
                            </span>
                          </div>
                        </motion.div>
                      )}

                      {msg.metadata?.dayPlan && (
                        <AgentDayPlanCard
                          plan={msg.metadata.dayPlan}
                          onAccept={() => {}}
                          onReject={() => {}}
                        />
                      )}
                    </div>
                  </div>
                ))}

                {agentLoading && !agentMessages.some(m => m.role === 'assistant' && (m.content || m.toolSteps?.length)) && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-gray-600" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl px-4 py-3">
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Card */}
              <div className="p-4 border-t border-gray-200/50">
                <div className="flex flex-col border border-gray-200 rounded-2xl p-2 bg-gray-50/30 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400/80 transition-all">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={intents.find(i => i.value === selectedIntent)?.placeholder || '问我关于旅行的任何问题...'}
                    rows={2}
                    className="w-full resize-none border-0 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-0 transition-all max-h-32 text-gray-800"
                    style={{ minHeight: '48px' }}
                  />
                  <div className="flex justify-between items-center border-t border-gray-100 pt-2 px-1 mt-1">
                    {/* Dropdown in bottom-left */}
                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setIsIntentDropdownOpen(!isIntentDropdownOpen)}
                        className="h-7 px-2 bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 rounded-lg flex items-center gap-1.5 transition-all text-[11px] font-medium text-gray-600 cursor-pointer shadow-sm"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${intents.find(i => i.value === selectedIntent)?.color || 'from-blue-500 to-indigo-600'}`} />
                        <span>{intents.find(i => i.value === selectedIntent)?.label || '地点探索'}</span>
                        <svg
                          className={`w-2.5 h-2.5 text-gray-400 transition-transform ${isIntentDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      <AnimatePresence>
                        {isIntentDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-full left-0 mb-1.5 w-64 bg-white/95 backdrop-blur-md border border-gray-200/80 rounded-xl p-2 shadow-xl z-50 flex flex-col gap-1"
                          >
                            <div className="px-2 py-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                              选择对话模式
                            </div>
                            {intents.map(item => (
                              <button
                                key={item.value}
                                onClick={() => {
                                  setSelectedIntent(item.value)
                                  setIsIntentDropdownOpen(false)
                                }}
                                className={`w-full text-left p-1.5 rounded-lg transition-all flex items-start gap-2 hover:bg-gray-50 active:bg-gray-100 ${
                                  selectedIntent === item.value
                                    ? 'bg-blue-50/50 hover:bg-blue-50/70 border border-blue-100/50'
                                    : 'border border-transparent'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 bg-gradient-to-r ${item.color} flex-shrink-0`} />
                                <div className="flex flex-col">
                                  <span className={`text-xs font-semibold ${selectedIntent === item.value ? 'text-blue-700' : 'text-gray-700'}`}>
                                    {item.label}
                                  </span>
                                  <span className="text-[9px] text-gray-400 mt-0.5 leading-normal">
                                    {item.desc}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Send Button in bottom-right */}
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || agentLoading}
                      className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-lg hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
      {isAgentPanelOpen && isMobile && isMinimized && (
        <motion.button
          initial={{ scale: 0, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0, opacity: 0, y: 50 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          onClick={() => setIsMinimized(false)}
          className='fixed bottom-28 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-full shadow-2xl flex items-center justify-center z-[60] border-2 border-white cursor-pointer select-none animate-pulse hover:animate-none'
          style={{ animationDuration: '3s' }}
          title='打开智能助手'
        >
          <Bot className='w-6 h-6 text-white' />
          <span className='absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-black border border-white shadow-sm'>
            AI
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
