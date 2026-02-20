# Phase 3: Activities & Dashboard

> Backend routes for activities/logs and the dashboard strip component.

---

## Goals
- [ ] Activities CRUD routes
- [ ] Dashboard data endpoint (bills, upcoming, overdue)
- [ ] DashboardStrip component for visual status
- [ ] Activity logging endpoints

---

## 3.1 Backend Activities Routes

### backend/src/routes/activities.js
```js
import { Router } from 'express'
import pool from '../db/pool.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/activities - List all activities with current period status
router.get('/', async (req, res) => {
  try {
    const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM

    const result = await pool.query(
      `SELECT
        a.id,
        a.title,
        a.category,
        a.recurrence,
        a.recurrence_day,
        a.is_active,
        a.created_at,
        COALESCE(
          (SELECT l.status FROM activity_logs l
           WHERE l.activity_id = a.id AND l.period = $2
           ORDER BY l.created_at DESC LIMIT 1),
          'pending'
        ) as current_status
      FROM activities a
      WHERE a.user_id = $1 AND a.is_active = true
      ORDER BY a.created_at DESC`,
      [req.user.id, currentPeriod]
    )

    res.json(result.rows)
  } catch (err) {
    console.error('Get activities error:', err)
    res.status(500).json({ error: 'Failed to get activities' })
  }
})

// GET /api/activities/dashboard - Dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    // Monthly bills with current period status
    const billsResult = await pool.query(
      `SELECT
        a.id,
        a.title,
        a.category,
        a.recurrence_day,
        COALESCE(
          (SELECT l.status FROM activity_logs l
           WHERE l.activity_id = a.id AND l.period = $2
           ORDER BY l.created_at DESC LIMIT 1),
          'pending'
        ) as status
      FROM activities a
      WHERE a.user_id = $1
        AND a.recurrence = 'monthly'
        AND a.is_active = true
      ORDER BY a.recurrence_day ASC NULLS LAST, a.title ASC`,
      [req.user.id, currentPeriod]
    )

    // Upcoming tasks (due in next 7 days)
    const upcomingResult = await pool.query(
      `SELECT
        l.id as log_id,
        a.id as activity_id,
        a.title,
        a.category,
        l.status,
        l.due_date,
        l.notes
      FROM activity_logs l
      JOIN activities a ON l.activity_id = a.id
      WHERE l.user_id = $1
        AND l.status = 'pending'
        AND l.due_date >= $2
        AND l.due_date < $3
      ORDER BY l.due_date ASC`,
      [req.user.id, today.toISOString(), nextWeek.toISOString()]
    )

    // Overdue tasks
    const overdueResult = await pool.query(
      `SELECT
        l.id as log_id,
        a.id as activity_id,
        a.title,
        a.category,
        l.status,
        l.due_date,
        l.notes
      FROM activity_logs l
      JOIN activities a ON l.activity_id = a.id
      WHERE l.user_id = $1
        AND l.status = 'pending'
        AND l.due_date < $2
      ORDER BY l.due_date ASC`,
      [req.user.id, today.toISOString()]
    )

    res.json({
      currentPeriod,
      bills: billsResult.rows,
      upcoming: upcomingResult.rows,
      overdue: overdueResult.rows
    })
  } catch (err) {
    console.error('Get dashboard error:', err)
    res.status(500).json({ error: 'Failed to get dashboard data' })
  }
})

// POST /api/activities - Create new activity
router.post('/', async (req, res) => {
  try {
    const { title, category = 'task', recurrence = null, recurrence_day = null } = req.body

    if (!title?.trim()) {
      return res.status(400).json({ error: 'Title is required' })
    }

    const validCategories = ['bill', 'task', 'event', 'note']
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' })
    }

    const result = await pool.query(
      `INSERT INTO activities (user_id, title, category, recurrence, recurrence_day)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, title.trim(), category, recurrence, recurrence_day]
    )

    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('Create activity error:', err)
    res.status(500).json({ error: 'Failed to create activity' })
  }
})

// POST /api/activities/log - Create activity log entry
router.post('/log', async (req, res) => {
  try {
    const { activity_id, status = 'done', notes = null, due_date = null, period = null } = req.body

    if (!activity_id) {
      return res.status(400).json({ error: 'activity_id is required' })
    }

    // Verify activity belongs to user
    const activityCheck = await pool.query(
      'SELECT id FROM activities WHERE id = $1 AND user_id = $2',
      [activity_id, req.user.id]
    )
    if (activityCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const validStatuses = ['done', 'pending', 'skipped']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    // Default period to current month
    const logPeriod = period || new Date().toISOString().slice(0, 7)
    const completedAt = status === 'done' ? new Date().toISOString() : null

    const result = await pool.query(
      `INSERT INTO activity_logs (activity_id, user_id, status, period, notes, due_date, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [activity_id, req.user.id, status, logPeriod, notes, due_date, completedAt]
    )

    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('Create log error:', err)
    res.status(500).json({ error: 'Failed to create log' })
  }
})

// PATCH /api/activities/log/:logId - Update activity log
router.patch('/log/:logId', async (req, res) => {
  try {
    const { logId } = req.params
    const { status, notes } = req.body

    // Verify log belongs to user
    const logCheck = await pool.query(
      'SELECT id, status FROM activity_logs WHERE id = $1 AND user_id = $2',
      [logId, req.user.id]
    )
    if (logCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Log not found' })
    }

    const updates = []
    const values = []
    let paramIndex = 1

    if (status !== undefined) {
      const validStatuses = ['done', 'pending', 'skipped']
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' })
      }
      updates.push(`status = $${paramIndex}`)
      values.push(status)
      paramIndex++

      // Set completed_at when marking as done
      if (status === 'done') {
        updates.push(`completed_at = NOW()`)
      } else {
        updates.push(`completed_at = NULL`)
      }
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`)
      values.push(notes)
      paramIndex++
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' })
    }

    values.push(logId)

    const result = await pool.query(
      `UPDATE activity_logs
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    )

    res.json(result.rows[0])
  } catch (err) {
    console.error('Update log error:', err)
    res.status(500).json({ error: 'Failed to update log' })
  }
})

// DELETE /api/activities/:activityId - Soft delete (deactivate) activity
router.delete('/:activityId', async (req, res) => {
  try {
    const { activityId } = req.params

    const result = await pool.query(
      `UPDATE activities
       SET is_active = false
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [activityId, req.user.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Delete activity error:', err)
    res.status(500).json({ error: 'Failed to delete activity' })
  }
})

export default router
```

### Update backend/src/index.js
```js
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

import authRoutes from './routes/auth.js'
import settingsRoutes from './routes/settings.js'
import activitiesRoutes from './routes/activities.js'

const app = express()

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/activities', activitiesRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
```

---

## 3.2 Frontend Dashboard Strip Component

### frontend/src/components/DashboardStrip.jsx
```jsx
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
```

### frontend/src/components/CategoryBadge.jsx
```jsx
const categoryStyles = {
  bill: 'bg-warning-500/20 text-warning-400',
  task: 'bg-primary-500/20 text-primary-400',
  event: 'bg-purple-500/20 text-purple-400',
  note: 'bg-slate-600/50 text-slate-300'
}

const categoryLabels = {
  bill: 'Bill',
  task: 'Task',
  event: 'Event',
  note: 'Note'
}

export default function CategoryBadge({ category }) {
  const style = categoryStyles[category] || categoryStyles.note
  const label = categoryLabels[category] || category

  return (
    <span className={`badge ${style}`}>
      {label}
    </span>
  )
}
```

---

## 3.3 Update Tailwind Config for Purple

### frontend/tailwind.config.js (add purple to extend.colors)
```js
// Add to the colors object:
purple: {
  400: '#c084fc',
  500: '#a855f7',
  600: '#9333ea',
}
```

---

## 3.4 Verification Checklist

After Phase 3, verify:

- [ ] GET `/api/activities` returns user activities with current status
- [ ] GET `/api/activities/dashboard` returns bills, upcoming, overdue arrays
- [ ] POST `/api/activities` creates a new activity
- [ ] POST `/api/activities/log` creates a log entry
- [ ] PATCH `/api/activities/log/:id` updates status/notes
- [ ] DELETE `/api/activities/:id` soft-deletes (sets is_active=false)
- [ ] DashboardStrip shows loading skeleton initially
- [ ] DashboardStrip shows overdue section in red when present
- [ ] DashboardStrip shows bills with status indicator
- [ ] DashboardStrip shows upcoming tasks for the week
- [ ] Horizontal scroll works on mobile for overflow
- [ ] `window.__reloadDashboard()` refreshes the data

---

## Files Created/Modified in Phase 3

**New Files:**
```
backend/src/routes/activities.js
frontend/src/components/DashboardStrip.jsx
frontend/src/components/CategoryBadge.jsx
```

**Modified Files:**
```
backend/src/index.js            # Add activities routes
frontend/tailwind.config.js     # Add purple color
```
