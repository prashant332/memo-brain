import { useState, useEffect, useCallback } from 'react'
import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import api from '../lib/api'

export default function DashboardStrip() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadDashboard = useCallback(async () => {
    try {
      setError(null)
      const { data: dashboard } = await api.get('/activities/dashboard')
      setData(dashboard)
    } catch (err) {
      console.error('Dashboard load error:', err)
      setError('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()

    // Expose reload function globally for ChatPage
    window.__reloadDashboard = loadDashboard
    return () => {
      delete window.__reloadDashboard
    }
  }, [loadDashboard])

  const formatDueDate = (dateStr) => {
    if (!dateStr) return ''
    const date = parseISO(dateStr)
    if (isToday(date)) return 'Today'
    if (isTomorrow(date)) return 'Tomorrow'
    return format(date, 'EEE') // Mon, Tue, etc.
  }

  if (loading) {
    return (
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 w-28 bg-slate-800 rounded-lg animate-pulse flex-shrink-0" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-3 border-b border-slate-800">
        <p className="text-sm text-error-400">{error}</p>
      </div>
    )
  }

  const hasContent = data?.bills?.length > 0 || data?.upcoming?.length > 0 || data?.overdue?.length > 0

  if (!hasContent) {
    return null // Don't show strip if no data
  }

  return (
    <div className="border-b border-slate-800 bg-slate-900/30">
      {/* Overdue Section */}
      {data.overdue?.length > 0 && (
        <div className="px-4 py-2 border-b border-slate-800/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-error-400 uppercase tracking-wide">
              Overdue
            </span>
            <span className="badge-error text-xs">{data.overdue.length}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {data.overdue.map((item) => (
              <div
                key={item.log_id}
                className="flex-shrink-0 px-3 py-2 bg-error-500/10 border border-error-500/20 rounded-lg"
              >
                <p className="text-sm font-medium text-error-300 truncate max-w-[140px]">
                  {item.title}
                </p>
                <p className="text-xs text-error-400/70">
                  {item.due_date ? format(parseISO(item.due_date), 'MMM d') : 'No date'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bills Section */}
      {data.bills?.length > 0 && (
        <div className="px-4 py-2 border-b border-slate-800/50">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Bills · {format(new Date(), 'MMMM')}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {data.bills.map((bill) => (
              <div
                key={bill.id}
                className={`flex-shrink-0 px-3 py-2 rounded-lg border ${
                  bill.status === 'done'
                    ? 'bg-success-500/10 border-success-500/20'
                    : 'bg-slate-800/50 border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      bill.status === 'done' ? 'bg-success-500' : 'bg-warning-500'
                    }`}
                  />
                  <span className="text-sm font-medium truncate max-w-[120px]">
                    {bill.title}
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${
                  bill.status === 'done' ? 'text-success-400' : 'text-slate-400'
                }`}>
                  {bill.status === 'done' ? 'Paid' : 'Due'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming This Week */}
      {data.upcoming?.length > 0 && (
        <div className="px-4 py-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            This Week
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {data.upcoming.map((item) => (
              <div
                key={item.log_id}
                className="flex-shrink-0 px-3 py-2 bg-primary-500/10 border border-primary-500/20 rounded-lg"
              >
                <p className="text-sm font-medium text-primary-300 truncate max-w-[140px]">
                  {item.title}
                </p>
                <p className="text-xs text-primary-400/70">
                  {formatDueDate(item.due_date)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
