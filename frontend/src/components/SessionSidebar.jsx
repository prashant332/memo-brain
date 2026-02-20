import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'

export default function SessionSidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
  onNavigateSettings
}) {
  const { user, logout } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/sessions')
      setSessions(data)
    } catch (err) {
      console.error('Load sessions error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const deleteSession = async (e, sessionId) => {
    e.stopPropagation()
    try {
      await api.delete(`/chat/sessions/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (currentSessionId === sessionId) {
        onNewSession()
      }
    } catch (err) {
      console.error('Delete session error:', err)
    }
  }

  const clearAllSessions = async () => {
    if (!confirm('Delete all chat sessions?')) return
    try {
      await Promise.all(sessions.map((s) => api.delete(`/chat/sessions/${s.id}`)))
      setSessions([])
      onNewSession()
    } catch (err) {
      console.error('Clear sessions error:', err)
    }
  }

  useEffect(() => {
    loadSessions()

    // Expose reload function globally
    window.__reloadSessions = loadSessions
    return () => {
      delete window.__reloadSessions
    }
  }, [loadSessions])

  // Reload when session changes
  useEffect(() => {
    if (currentSessionId) {
      loadSessions()
    }
  }, [currentSessionId, loadSessions])

  const formatTime = (dateStr) => {
    try {
      return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
    } catch {
      return ''
    }
  }

  return (
    <aside className="w-72 h-full bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <button
          onClick={onNewSession}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">
            No conversations yet
          </div>
        ) : (
          <>
            {/* Clear All Button */}
            <div className="px-3 py-2 border-b border-slate-800">
              <button
                onClick={clearAllSessions}
                className="text-xs text-slate-500 hover:text-error-400 transition-colors"
              >
                Clear all sessions
              </button>
            </div>
            <div className="p-2 space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group relative rounded-lg transition-colors ${
                    currentSessionId === session.id
                      ? 'bg-primary-500/20 border border-primary-500/30'
                      : 'hover:bg-slate-800'
                  }`}
                >
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className="w-full text-left p-3 pr-10"
                  >
                    <p className="font-medium truncate text-sm">
                      {session.title || 'New Session'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatTime(session.started_at)}
                    </p>
                  </button>
                  <button
                    onClick={(e) => deleteSession(e, session.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-700 text-slate-400 hover:text-error-400 transition-all"
                    title="Delete session"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer - User Info */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 font-medium">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{user?.name}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={onNavigateSettings}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={logout}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-error-400"
              title="Sign out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
