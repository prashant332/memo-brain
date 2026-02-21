import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts'
import api from '../lib/api'
import CategoryBadge from '../components/CategoryBadge'

const RANGE_OPTIONS = [
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '12M', value: 12 }
]

const chartColors = {
  primary: '#3b82f6',
  success: '#22c55e',
  slate: '#475569',
  bg: '#1e293b'
}

function RangeToggle({ value, onChange }) {
  return (
    <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
      {RANGE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
            value === opt.value ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <svg className="w-10 h-10 mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-sm">No data yet — keep logging and your trends will appear here.</p>
    </div>
  )
}

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const [range, setRange] = useState(6)
  const [billData, setBillData] = useState([])
  const [taskData, setTaskData] = useState([])
  const [activities, setActivities] = useState([])
  const [selectedActivityId, setSelectedActivityId] = useState('')
  const [activityHistory, setActivityHistory] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [billRes, taskRes] = await Promise.all([
        api.get('/analytics/monthly-completion', { params: { months: range } }),
        api.get('/analytics/task-trends', { params: { months: range } })
      ])
      setBillData(billRes.data)
      setTaskData(taskRes.data)
    } catch (err) {
      console.error('Analytics load error:', err)
    } finally {
      setLoading(false)
    }
  }, [range])

  const loadActivities = useCallback(async () => {
    try {
      const { data } = await api.get('/activities')
      setActivities(data)
    } catch (err) {
      console.error('Load activities error:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
    loadActivities()
  }, [loadData, loadActivities])

  const loadActivityHistory = useCallback(async (activityId) => {
    if (!activityId) {
      setActivityHistory(null)
      return
    }
    try {
      const { data } = await api.get(`/analytics/activity-history/${activityId}`)
      setActivityHistory(data)
    } catch (err) {
      console.error('Activity history error:', err)
    }
  }, [])

  useEffect(() => {
    loadActivityHistory(selectedActivityId)
  }, [selectedActivityId, loadActivityHistory])

  const formatPeriodLabel = (period) => {
    if (!period) return ''
    try {
      const [year, month] = period.split('-')
      return format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMM yy')
    } catch {
      return period
    }
  }

  const formatLogDate = (dateStr) => {
    if (!dateStr) return ''
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy')
    } catch {
      return ''
    }
  }

  const billChartData = billData.map(d => ({
    ...d,
    name: formatPeriodLabel(d.period)
  }))

  const taskChartData = taskData.map(d => ({
    ...d,
    name: formatPeriodLabel(d.period)
  }))

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold">Analytics</h1>
          </div>
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Bill Completion Chart */}
            <section className="card p-5">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
                Monthly Bill Completion
              </h2>
              {billChartData.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={billChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} unit="%" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(value, name) => [
                        name === 'percentage' ? `${value}%` : value,
                        name === 'percentage' ? 'Paid' : name === 'completed' ? 'Paid' : 'Total'
                      ]}
                    />
                    <Bar dataKey="percentage" fill="#3b82f6" radius={[4, 4, 0, 0]} name="percentage" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>

            {/* Task Completion Trend */}
            <section className="card p-5">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
                Task Completion Trend
              </h2>
              {taskChartData.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={taskChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(value) => [value, 'Tasks Completed']}
                    />
                    <Line type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </section>

            {/* Activity Timeline */}
            <section className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
                  Activity Timeline
                </h2>
                <select
                  value={selectedActivityId}
                  onChange={e => setSelectedActivityId(e.target.value)}
                  className="input-field text-sm py-1.5 w-56"
                >
                  <option value="">Select an activity...</option>
                  {activities.map(a => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>

              {!selectedActivityId ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Select an activity above to view its timeline
                </div>
              ) : !activityHistory ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
                </div>
              ) : activityHistory.logs.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <CategoryBadge category={activityHistory.activity.category} />
                    <span className="text-sm font-medium">{activityHistory.activity.title}</span>
                  </div>
                  {activityHistory.logs.map(log => (
                    <div key={log.id} className="flex items-start gap-3 py-2 border-b border-slate-800/50 last:border-0">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        log.status === 'done' ? 'bg-success-500' :
                        log.status === 'skipped' ? 'bg-slate-600' : 'bg-warning-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm capitalize">{log.status}</span>
                          {log.period && <span className="text-xs text-slate-500">{log.period}</span>}
                          {log.metadata?.amount && (
                            <span className="text-xs text-slate-400">₹{log.metadata.amount}</span>
                          )}
                        </div>
                        {log.completed_at && (
                          <p className="text-xs text-slate-500 mt-0.5">{formatLogDate(log.completed_at)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
