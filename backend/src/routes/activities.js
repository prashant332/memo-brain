import { Router } from 'express'
import pool from '../db/pool.js'
import { authMiddleware } from '../middleware/auth.js'
import { createRecurringLogs } from '../services/cron.js'

const router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/activities - List all activities with current period status
router.get('/', async (req, res) => {
  try {
    const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM
    const includeInactive = req.query.include_inactive === 'true'

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
      WHERE a.user_id = $1 AND (a.is_active = true OR $3 = true)
      ORDER BY a.created_at DESC`,
      [req.user.id, currentPeriod, includeInactive]
    )

    res.json(result.rows)
  } catch (err) {
    console.error('Get activities error:', err)
    res.status(500).json({ error: 'Failed to get activities' })
  }
})

// GET /api/activities/:activityId/logs - Paginated log history for an activity
router.get('/:activityId/logs', async (req, res) => {
  try {
    const { activityId } = req.params
    const offset = parseInt(req.query.offset) || 0
    const limit = 20

    // Verify activity belongs to user
    const activityCheck = await pool.query(
      'SELECT id, title, category FROM activities WHERE id = $1 AND user_id = $2',
      [activityId, req.user.id]
    )
    if (activityCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const result = await pool.query(
      `SELECT l.id, l.status, l.period, l.due_date, l.completed_at, l.metadata, l.created_at
       FROM activity_logs l
       WHERE l.activity_id = $1 AND l.user_id = $2
       ORDER BY l.created_at DESC
       LIMIT $3 OFFSET $4`,
      [activityId, req.user.id, limit, offset]
    )

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM activity_logs WHERE activity_id = $1 AND user_id = $2',
      [activityId, req.user.id]
    )

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      offset,
      limit
    })
  } catch (err) {
    console.error('Get activity logs error:', err)
    res.status(500).json({ error: 'Failed to get activity logs' })
  }
})

// PATCH /api/activities/:activityId - Edit activity title, category, recurrence_day
router.patch('/:activityId', async (req, res) => {
  try {
    const { activityId } = req.params
    const { title, category, recurrence_day, recurrence } = req.body

    // Verify activity belongs to user
    const activityCheck = await pool.query(
      'SELECT id FROM activities WHERE id = $1 AND user_id = $2',
      [activityId, req.user.id]
    )
    if (activityCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const updates = []
    const values = []
    let paramIndex = 1

    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'Title cannot be empty' })
      updates.push(`title = $${paramIndex}`)
      values.push(title.trim())
      paramIndex++
    }

    if (category !== undefined) {
      const validCategories = ['bill', 'task', 'event', 'note']
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' })
      }
      updates.push(`category = $${paramIndex}`)
      values.push(category)
      paramIndex++
    }

    if (recurrence !== undefined) {
      updates.push(`recurrence = $${paramIndex}`)
      values.push(recurrence || null)
      paramIndex++
    }

    if (recurrence_day !== undefined) {
      updates.push(`recurrence_day = $${paramIndex}`)
      values.push(recurrence_day || null)
      paramIndex++
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' })
    }

    values.push(activityId)
    const result = await pool.query(
      `UPDATE activities SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    )

    res.json(result.rows[0])
  } catch (err) {
    console.error('Update activity error:', err)
    res.status(500).json({ error: 'Failed to update activity' })
  }
})

// GET /api/activities/dashboard - Dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM
    const now = new Date()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    // Auto-complete past events so they don't linger as overdue
    await pool.query(
      `UPDATE activity_logs l
       SET status = 'done', completed_at = NOW()
       FROM activities a
       WHERE l.activity_id = a.id
         AND l.user_id = $1
         AND a.category = 'event'
         AND l.status = 'pending'
         AND l.due_date IS NOT NULL
         AND l.due_date < $2`,
      [req.user.id, now.toISOString()]
    )

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

    // Upcoming events (all future events with a due_date set)
    const eventsResult = await pool.query(
      `SELECT
        l.id as log_id,
        a.id as activity_id,
        a.title,
        l.due_date,
        l.metadata
      FROM activity_logs l
      JOIN activities a ON l.activity_id = a.id
      WHERE l.user_id = $1
        AND a.category = 'event'
        AND l.status = 'pending'
        AND l.due_date IS NOT NULL
        AND l.due_date >= $2
      ORDER BY l.due_date ASC
      LIMIT 10`,
      [req.user.id, now.toISOString()]
    )

    // Upcoming tasks (due in next 7 days, excluding events)
    const upcomingResult = await pool.query(
      `SELECT
        l.id as log_id,
        a.id as activity_id,
        a.title,
        a.category,
        l.status,
        l.due_date,
        l.metadata
      FROM activity_logs l
      JOIN activities a ON l.activity_id = a.id
      WHERE l.user_id = $1
        AND a.category != 'event'
        AND l.status = 'pending'
        AND l.due_date >= $2
        AND l.due_date < $3
      ORDER BY l.due_date ASC`,
      [req.user.id, today.toISOString(), nextWeek.toISOString()]
    )

    // Overdue tasks (excluding events)
    const overdueResult = await pool.query(
      `SELECT
        l.id as log_id,
        a.id as activity_id,
        a.title,
        a.category,
        l.status,
        l.due_date,
        l.metadata
      FROM activity_logs l
      JOIN activities a ON l.activity_id = a.id
      WHERE l.user_id = $1
        AND a.category != 'event'
        AND l.status = 'pending'
        AND l.due_date < $2
      ORDER BY l.due_date ASC`,
      [req.user.id, today.toISOString()]
    )

    res.json({
      currentPeriod,
      bills: billsResult.rows,
      events: eventsResult.rows,
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
    const { activity_id, status = 'done', metadata = {}, due_date = null, period = null } = req.body

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
      `INSERT INTO activity_logs (activity_id, user_id, status, period, metadata, due_date, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [activity_id, req.user.id, status, logPeriod, JSON.stringify(metadata), due_date, completedAt]
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
    const { status, metadata } = req.body

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

    if (metadata !== undefined) {
      updates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${paramIndex}::jsonb`)
      values.push(JSON.stringify(metadata))
      paramIndex++

      // If date is provided (event form), combine with time and update due_date
      if (metadata.date) {
        const timeStr = metadata.time || '00:00'
        const dueDateISO = `${metadata.date}T${timeStr}:00`
        updates.push(`due_date = $${paramIndex}`)
        values.push(dueDateISO)
        paramIndex++
      }
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

// POST /api/activities/trigger-recurring - Manual trigger for testing
router.post('/trigger-recurring', async (req, res) => {
  try {
    const period = req.query.period || new Date().toISOString().slice(0, 7)
    const result = await createRecurringLogs(period)
    res.json({ success: true, period, ...result })
  } catch (err) {
    console.error('Trigger recurring error:', err)
    res.status(500).json({ error: 'Failed to trigger recurring logs' })
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
