import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Plus, Trash2, Loader2, Bot, User, MapPin, ArrowLeft, MessageSquare } from 'lucide-react'
import { useTripStore } from '../store'
import { AgentSuggestedPlaceCard } from './AgentSuggestedPlaceCard'
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
    deleteAgentSession,
    setActiveAgentSession,
    sendAgentMessage,
    currentTrip,
  } = useTripStore()

  const [input, setInput] = useState('')
  const [view, setView] = useState<'list' | 'chat'>('list')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
    await sendAgentMessage(input.trim(), currentTrip?.id)
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
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 420, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden h-full"
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
            <div className="flex items-center gap-1">
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
                      <p className="text-sm font-medium text-gray-800 truncate">{session.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(session.updatedAt)}</p>
                    </div>
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

                      {msg.metadata?.suggestedPlaces && msg.metadata.suggestedPlaces.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {msg.metadata.suggestedPlaces.map((place, i) => (
                            <AgentSuggestedPlaceCard key={i} index={i} {...place} />
                          ))}
                        </div>
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

              {/* Input */}
              <div className="p-4 border-t border-gray-200/50">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="问我关于旅行的任何问题..."
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all max-h-32"
                    style={{ minHeight: '42px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || agentLoading}
                    className="p-2.5 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
