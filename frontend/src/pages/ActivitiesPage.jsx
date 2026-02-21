import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import ActivityCard from '../components/ActivityCard'
import CategoryBadge from '../components/CategoryBadge'

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'bill', label: 'Bills' },
  { id: 'task', label: 'Tasks' },
  { id: 'event', label: 'Events' },
  { id: 'note', label: 'Notes' }
]

const statusColors = {
  done: 'bg-success-500/10 border-success-500/20 text-success-400',
  pending: 'bg-slate-800/50 border-slate-700 text-slate-400',
  skipped: 'bg-slate-900/50 border-slate-800 text-slate-500'
}

export default function ActivitiesPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsOffset, setLogsOffset] = useState(0)
  const [logsTotal, setLogsTotal] = useState(0)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingActivity, setEditingActivity] = useState(null)

  const loadActivities = useCallback(async () => {
    try {
      const { data } = await api.get('/activities', {
        params: { include_inactive: showInactive }
      })
      setActivities(data)
    } catch (err) {
      console.error('Load activities error:', err)
      toast.error('Failed to load activities')
    } finally {
      setLoading(false)
    }
  }, [showInactive])

  useEffect(() => {
    loadActivities()
    window.__reloadActivities = loadActivities
    return () => { delete window.__reloadActivities }
  }, [loadActivities])

  const loadLogs = useCallback(async (activityId, offset = 0) => {
    setLogsLoading(true)
    try {
      const { data } = await api.get(`/activities/${activityId}/logs`, {
        params: { offset }
      })
      if (offset === 0) {
        setLogs(data.logs)
      } else {
        setLogs(prev => [...prev, ...data.logs])
      }
      setLogsTotal(data.total)
      setLogsOffset(offset + data.logs.length)
    } catch (err) {
      console.error('Load logs error:', err)
      toast.error('Failed to load activity history')
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const handleSelectActivity = (activity) => {
    setSelectedActivity(activity)
    setLogs([])
    setLogsOffset(0)
    loadLogs(activity.id, 0)
  }

  const handleDeactivate = async (activityId) => {
    if (!confirm('Deactivate this activity? It will no longer appear in the dashboard.')) return
    try {
      await api.delete(`/activities/${activityId}`)
      toast.success('Activity deactivated')
      setSelectedActivity(null)
      loadActivities()
      window.__reloadDashboard?.()
    } catch (err) {
      toast.error('Failed to deactivate activity')
    }
  }

  const handleUpdateLogStatus = async (logId, status) => {
    try {
      await api.patch(`/activities/log/${logId}`, { status })
      toast.success('Status updated')
      loadLogs(selectedActivity.id, 0)
      window.__reloadDashboard?.()
    } catch (err) {
      toast.error('Failed to update status')
    }
  }

  const filteredActivities = activities.filter(a => {
    if (filter !== 'all' && a.category !== filter) return false
    return true
  })

  const formatLogDate = (dateStr) => {
    if (!dateStr) return ''
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy')
    } catch {
      return ''
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold">Activities</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={e => setShowInactive(e.target.checked)}
                className="rounded border-slate-600"
              />
              Show inactive
            </label>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Activity
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-6 h-[calc(100vh-120px)]">
          {/* Left panel — list */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-3">
            {/* Filter tabs */}
            <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                    filter === tab.id
                      ? 'bg-primary-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Activity list */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />
                ))
              ) : filteredActivities.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-sm">No activities found</p>
                </div>
              ) : (
                filteredActivities.map(activity => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    selected={selectedActivity?.id === activity.id}
                    onClick={() => handleSelectActivity(activity)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right panel — detail */}
          <div className="flex-1 overflow-hidden">
            {selectedActivity ? (
              <div className="h-full flex flex-col card p-0 overflow-hidden">
                {/* Activity detail header */}
                <div className="p-5 border-b border-slate-800">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{selectedActivity.title}</h2>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <CategoryBadge category={selectedActivity.category} />
                        {selectedActivity.recurrence && (
                          <span className="text-xs text-slate-400 capitalize">
                            {selectedActivity.recurrence}
                            {selectedActivity.recurrence_day ? ` · Day ${selectedActivity.recurrence_day}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingActivity({ ...selectedActivity })
                          setShowEditModal(true)
                        }}
                        className="btn-secondary text-sm"
                      >
                        Edit
                      </button>
                      {selectedActivity.is_active && (
                        <button
                          onClick={() => handleDeactivate(selectedActivity.id)}
                          className="btn-ghost text-sm text-error-400"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Log timeline */}
                <div className="flex-1 overflow-y-auto p-5">
                  <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
                    History ({logsTotal})
                  </h3>

                  {logsLoading && logs.length === 0 ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <p className="text-sm">No history yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {logs.map(log => (
                        <div
                          key={log.id}
                          className={`p-3 rounded-lg border ${statusColors[log.status] || statusColors.pending}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium capitalize">{log.status}</span>
                                {log.period && (
                                  <span className="text-xs text-slate-500">{log.period}</span>
                                )}
                              </div>
                              {log.metadata?.amount && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Amount: ₹{log.metadata.amount}
                                </p>
                              )}
                              {log.metadata?.notes && (
                                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[300px]">
                                  {log.metadata.notes}
                                </p>
                              )}
                              {log.completed_at && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Completed: {formatLogDate(log.completed_at)}
                                </p>
                              )}
                              {log.due_date && !log.completed_at && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Due: {formatLogDate(log.due_date)}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              {log.status !== 'done' && (
                                <button
                                  onClick={() => handleUpdateLogStatus(log.id, 'done')}
                                  className="text-xs px-2 py-1 rounded bg-success-500/10 text-success-400 hover:bg-success-500/20 transition-colors"
                                >
                                  Mark Done
                                </button>
                              )}
                              {log.status !== 'pending' && (
                                <button
                                  onClick={() => handleUpdateLogStatus(log.id, 'pending')}
                                  className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 transition-colors"
                                >
                                  Pending
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Load more */}
                      {logsOffset < logsTotal && (
                        <button
                          onClick={() => loadLogs(selectedActivity.id, logsOffset)}
                          disabled={logsLoading}
                          className="w-full py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          {logsLoading ? 'Loading...' : 'Load more'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-sm">Select an activity to view its history</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Activity Modal */}
      {showAddModal && (
        <AddActivityModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false)
            loadActivities()
          }}
        />
      )}

      {/* Edit Activity Modal */}
      {showEditModal && editingActivity && (
        <EditActivityModal
          activity={editingActivity}
          onClose={() => setShowEditModal(false)}
          onUpdated={(updated) => {
            setShowEditModal(false)
            setSelectedActivity(updated)
            loadActivities()
          }}
        />
      )}
    </div>
  )
}

function AddActivityModal({ onClose, onCreated }) {
  const toast = useToast()
  const [form, setForm] = useState({
    title: '',
    category: 'task',
    recurrence: '',
    recurrence_day: ''
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return

    setSaving(true)
    try {
      await api.post('/activities', {
        title: form.title.trim(),
        category: form.category,
        recurrence: form.recurrence || null,
        recurrence_day: form.recurrence_day ? parseInt(form.recurrence_day) : null
      })
      toast.success('Activity created')
      onCreated()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create activity')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Add Activity</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="input-field w-full"
              placeholder="e.g. Electricity Bill"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="input-field w-full"
            >
              <option value="task">Task</option>
              <option value="bill">Bill</option>
              <option value="event">Event</option>
              <option value="note">Note</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Recurrence</label>
            <select
              value={form.recurrence}
              onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
              className="input-field w-full"
            >
              <option value="">None</option>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          {form.recurrence === 'monthly' && (
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Due Day of Month</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.recurrence_day}
                onChange={e => setForm(f => ({ ...f, recurrence_day: e.target.value }))}
                className="input-field w-full"
                placeholder="e.g. 15"
              />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cancel
            </button>
            <button type="submit" disabled={!form.title.trim() || saving} className="btn-primary flex-1">
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditActivityModal({ activity, onClose, onUpdated }) {
  const toast = useToast()
  const [form, setForm] = useState({
    title: activity.title,
    category: activity.category,
    recurrence: activity.recurrence || '',
    recurrence_day: activity.recurrence_day || ''
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await api.patch(`/activities/${activity.id}`, {
        title: form.title.trim(),
        category: form.category,
        recurrence: form.recurrence || null,
        recurrence_day: form.recurrence_day ? parseInt(form.recurrence_day) : null
      })
      toast.success('Activity updated')
      onUpdated(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update activity')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Edit Activity</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="input-field w-full"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="input-field w-full"
            >
              <option value="task">Task</option>
              <option value="bill">Bill</option>
              <option value="event">Event</option>
              <option value="note">Note</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Recurrence</label>
            <select
              value={form.recurrence}
              onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
              className="input-field w-full"
            >
              <option value="">None</option>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          {form.recurrence === 'monthly' && (
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Due Day of Month</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.recurrence_day}
                onChange={e => setForm(f => ({ ...f, recurrence_day: e.target.value }))}
                className="input-field w-full"
                placeholder="e.g. 15"
              />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cancel
            </button>
            <button type="submit" disabled={!form.title.trim() || saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
