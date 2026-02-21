import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useAppContext } from '../context/AppContext'
import SessionSidebar from '../components/SessionSidebar'
import DashboardStrip from '../components/DashboardStrip'
import MessageBubble from '../components/MessageBubble'
import TypingIndicator from '../components/TypingIndicator'
import SetupPrompt from '../components/SetupPrompt'
import NotificationBell from '../components/NotificationBell'

const SUGGESTIONS = [
  'Paid electricity bill today',
  'Remind me to visit bank on Friday',
  'What bills are pending this month?',
  'Schedule dentist appointment for next week',
  'Did I pay the water bill?'
]

export default function ChatPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { activeBrainOwnerId } = useAppContext()

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Session state
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  // Input state
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // Refs
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Load messages when session changes
  useEffect(() => {
    if (sessionId) {
      loadMessages(sessionId)
    } else {
      setMessages([])
    }
  }, [sessionId])

  const loadMessages = async (sessId) => {
    setLoading(true)
    try {
      const { data } = await api.get(`/chat/sessions/${sessId}/messages`)
      setMessages(data)
    } catch (err) {
      console.error('Load messages error:', err)
      toast.error('Failed to load messages')
    } finally {
      setLoading(false)
    }
  }

  const createSession = async () => {
    try {
      const { data } = await api.post('/chat/sessions')
      return data.id
    } catch (err) {
      console.error('Create session error:', err)
      throw err
    }
  }

  const handleNewSession = async () => {
    setSessionId(null)
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  const handleSelectSession = (sessId) => {
    setSessionId(sessId)
  }

  const handleSend = async (text = input) => {
    const messageText = text.trim()
    if (!messageText || sending) return

    setSending(true)

    try {
      // Ensure we have a session
      let currentSessionId = sessionId
      if (!currentSessionId) {
        currentSessionId = await createSession()
        setSessionId(currentSessionId)
      }

      // Optimistic user message
      const optimisticMsg = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: messageText,
        created_at: new Date().toISOString()
      }
      setMessages((prev) => [...prev, optimisticMsg])
      setInput('')

      // Send to API
      const { data } = await api.post(`/chat/sessions/${currentSessionId}/message`, {
        content: messageText
      })

      // Check if session was auto-closed (user confirmed done)
      if (data.sessionClosed) {
        // Show success toast and reset to empty state
        toast.success('All done! Activity saved.')

        // Reset to empty state
        setSessionId(null)
        setMessages([])

        // Reload dashboard and sessions
        window.__reloadDashboard?.()
        window.__reloadSessions?.()
      } else {
        // Replace optimistic message and add assistant response
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== optimisticMsg.id)
          return [
            ...filtered,
            { ...optimisticMsg, id: `user-${Date.now()}` },
            data.message
          ]
        })

        // Reload dashboard if action was taken
        if (data.action && !['none', 'query', 'confirm_done'].includes(data.action.intent)) {
          window.__reloadDashboard?.()
        }
        // Reload sessions list
        window.__reloadSessions?.()
      }
    } catch (err) {
      console.error('Send error:', err)
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('temp-')))

      // Show error toast
      const errorMsg = err.response?.data?.error || 'Failed to send message'
      toast.error(errorMsg)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSuggestionClick = (suggestion) => {
    handleSend(suggestion)
  }

  const handleQuickReply = (text) => {
    handleSend(text)
  }

  // Save metadata directly via API (no AI round-trip)
  const handleSaveMetadata = async (logId, metadata) => {
    try {
      await api.patch(`/activities/log/${logId}`, { metadata })
      toast.success('Details saved!')

      // Mark the form as completed by removing ask_followup from the message
      setMessages(prev => prev.map(msg => {
        if (msg.metadata?.actionResult?.log_id === logId) {
          return {
            ...msg,
            metadata: {
              ...msg.metadata,
              action: { ...msg.metadata.action, ask_followup: false }
            }
          }
        }
        return msg
      }))

      // Reload dashboard to show updated data
      window.__reloadDashboard?.()
    } catch (err) {
      console.error('Save metadata error:', err)
      toast.error('Failed to save details')
    }
  }

  // Skip metadata collection
  const handleSkipMetadata = () => {
    // Mark all current ask_followup as false
    setMessages(prev => prev.map(msg => {
      if (msg.metadata?.action?.ask_followup) {
        return {
          ...msg,
          metadata: {
            ...msg.metadata,
            action: { ...msg.metadata.action, ask_followup: false }
          }
        }
      }
      return msg
    }))
  }

  return (
    <div className="h-screen flex overflow-hidden bg-slate-950">
      {/* Setup Prompt for first-time users */}
      <SetupPrompt />

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-30 transition-transform duration-200 md:relative md:translate-x-0`}
      >
        <SessionSidebar
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onNavigateSettings={() => navigate('/settings')}
        />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-800 rounded-lg md:hidden"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-lg">MemoBrain</h1>
            <p className="text-xs text-slate-500">Your personal memory assistant</p>
          </div>
          <NotificationBell />
        </header>

        {/* Dashboard Strip — shows shared brain if active */}
        <DashboardStrip ownerUserId={activeBrainOwnerId} />

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
            </div>
          ) : messages.length === 0 ? (
            // Empty state with suggestions
            <div className="h-full flex flex-col items-center justify-center">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-slate-200 mb-2">
                  What would you like to remember?
                </h2>
                <p className="text-slate-400 text-sm">
                  Type naturally or try one of these suggestions
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTIONS.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full text-sm text-slate-300 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((msg, index) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isLatest={index === messages.length - 1 && !sending}
                  onQuickReply={handleQuickReply}
                  onSaveMetadata={handleSaveMetadata}
                  onSkipMetadata={handleSkipMetadata}
                />
              ))}
              {sending && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-slate-800 p-4 bg-slate-900/50 safe-bottom">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="input-field resize-none pr-12 min-h-[48px] max-h-32"
                  style={{
                    height: 'auto',
                    minHeight: '48px'
                  }}
                  onInput={(e) => {
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
                  }}
                />
              </div>
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                className="btn-primary px-4 h-12 flex items-center justify-center"
              >
                {sending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
