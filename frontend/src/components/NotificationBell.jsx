import { useState, useRef, useEffect } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useNotifications } from '../hooks/useNotifications'

const typeColors = {
  overdue_bill: 'text-error-400',
  overdue_task: 'text-error-400',
  upcoming_bill: 'text-warning-500',
  upcoming_task: 'text-primary-400',
  pending_bill: 'text-warning-500'
}

const typeIcons = {
  overdue_bill: '⚠',
  overdue_task: '⚠',
  upcoming_bill: '◷',
  upcoming_task: '◷',
  pending_bill: '●'
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const { notifications, unreadCount, loading, markRead, markAllRead, dismiss } = useNotifications()

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleOpen = () => {
    setOpen(!open)
  }

  const handleMarkRead = async (id) => {
    await markRead(id)
  }

  const formatTime = (dateStr) => {
    try {
      return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
    } catch {
      return ''
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-error-500 rounded-full text-xs flex items-center justify-center text-white font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-slate-800/50 last:border-0 transition-colors ${
                    !n.is_read ? 'bg-primary-500/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`text-sm flex-shrink-0 mt-0.5 ${typeColors[n.type] || 'text-slate-400'}`}>
                      {typeIcons[n.type] || '●'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug ${!n.is_read ? 'text-slate-100' : 'text-slate-300'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>
                      )}
                      <p className="text-xs text-slate-600 mt-1">{formatTime(n.created_at)}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {!n.is_read && (
                        <button
                          onClick={() => handleMarkRead(n.id)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 transition-colors"
                          title="Mark as read"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => dismiss(n.id)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-error-400 transition-colors"
                        title="Dismiss"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
