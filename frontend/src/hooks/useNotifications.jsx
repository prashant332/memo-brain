import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../lib/api'
import { useAuth } from './useAuth'

const POLL_INTERVAL = 60_000 // 60 seconds

export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef(null)

  const loadNotifications = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await api.get('/notifications')
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch (err) {
      // Silently fail — notifications are non-critical
      console.error('Load notifications error:', err)
    }
  }, [user])

  const markRead = useCallback(async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Mark read error:', err)
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await api.patch('/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error('Mark all read error:', err)
    }
  }, [])

  const dismiss = useCallback(async (id) => {
    try {
      await api.delete(`/notifications/${id}`)
      setNotifications(prev => {
        const dismissed = prev.find(n => n.id === id)
        if (dismissed && !dismissed.is_read) {
          setUnreadCount(c => Math.max(0, c - 1))
        }
        return prev.filter(n => n.id !== id)
      })
    } catch (err) {
      console.error('Dismiss notification error:', err)
    }
  }, [])

  useEffect(() => {
    if (!user) return

    // Initial load
    setLoading(true)
    loadNotifications().finally(() => setLoading(false))

    // Polling
    intervalRef.current = setInterval(loadNotifications, POLL_INTERVAL)

    // Expose global reload
    window.__reloadNotifications = loadNotifications

    return () => {
      clearInterval(intervalRef.current)
      delete window.__reloadNotifications
    }
  }, [user, loadNotifications])

  return { notifications, unreadCount, loading, markRead, markAllRead, dismiss, reload: loadNotifications }
}
