import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, MessageSquare, Plus, Trash2, Loader2, Bot, User, MapPin } from 'lucide-react'
import { useTripStore } from '../store'
import { AgentSuggestedPlaceCard } from './AgentSuggestedPlaceCard'
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
  const [showSessions, setShowSessions] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isAgentPanelOpen) {
      fetchAgentSessions()
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
    }
    setInput('')
    await sendAgentMessage(input.trim(), currentTrip?.id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewSession = async () => {
    const id = await createAgentSession('新对话')
    if (id) await setActiveAgentSession(id)
    setShowSessions(false)
  }

  return (
    <AnimatePresence>
      {isAgentPanelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setAgentPanelOpen(false)}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-[420px] max-w-[90vw] bg-white/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm text-gray-900">旅行助手</h2>
                  <p className="text-xs text-gray-400">AI 行程规划</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSessions(!showSessions)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="历史会话"
                >
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  onClick={handleNewSession}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="新对话"
                >
                  <Plus className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  onClick={() => setAgentPanelOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Sessions dropdown */}
            <AnimatePresence>
              {showSessions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-gray-200/50 overflow-hidden"
                >
                  <div className="max-h-48 overflow-y-auto p-2">
                    {agentSessions.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-2">暂无历史会话</p>
                    ) : (
                      agentSessions.map(session => (
                        <div
                          key={session.id}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            session.id === activeAgentSessionId
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => {
                            setActiveAgentSession(session.id)
                            setShowSessions(false)
                          }}
                        >
                          <span className="text-sm truncate flex-1">{session.title}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteAgentSession(session.id)
                            }}
                            className="p-1 hover:bg-red-100 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                    <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                          {/* Blinking cursor while streaming */}
                          {agentLoading && msg.id === agentMessages[agentMessages.length - 1]?.id && (
                            <span className="inline-block w-0.5 h-4 bg-gray-800 ml-0.5 animate-pulse align-middle" />
                          )}
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>

                    {/* Suggested places */}
                    {msg.metadata?.suggestedPlaces && msg.metadata.suggestedPlaces.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {msg.metadata.suggestedPlaces.map((place, i) => (
                          <AgentSuggestedPlaceCard key={i} index={i} {...place} />
                        ))}
                      </div>
                    )}

                    {/* Trip created/modified card */}
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
                  </div>
                </div>
              ))}

              {agentLoading && !agentMessages.some(m => m.role === 'assistant' && m.content) && (
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
