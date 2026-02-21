import { Router } from 'express'
import pool from '../db/pool.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()
router.use(authMiddleware)

// GET /api/analytics/monthly-completion?months=6
// Bill completion % per month
router.get('/monthly-completion', async (req, res) => {
  try {
    const months = Math.min(parseInt(req.query.months) || 6, 24)
    const userId = req.user.id

    const result = await pool.query(
      `SELECT l.period,
              COUNT(*) FILTER (WHERE l.status = 'done') as completed,
              COUNT(*) as total
       FROM activity_logs l
       JOIN activities a ON l.activity_id = a.id
       WHERE l.user_id = $1
         AND a.recurrence = 'monthly'
         AND a.category = 'bill'
         AND l.period >= TO_CHAR(NOW() - ($2 || ' months')::INTERVAL, 'YYYY-MM')
       GROUP BY l.period
       ORDER BY l.period ASC`,
      [userId, months]
    )

    const data = result.rows.map(row => ({
      period: row.period,
      completed: parseInt(row.completed),
      total: parseInt(row.total),
      percentage: row.total > 0 ? Math.round((parseInt(row.completed) / parseInt(row.total)) * 100) : 0
    }))

    res.json(data)
  } catch (err) {
    console.error('Monthly completion error:', err)
    res.status(500).json({ error: 'Failed to get monthly completion data' })
  }
})

// GET /api/analytics/task-trends?months=6
// Task completions per month
router.get('/task-trends', async (req, res) => {
  try {
    const months = Math.min(parseInt(req.query.months) || 6, 24)
    const userId = req.user.id

    const result = await pool.query(
      `SELECT
         TO_CHAR(l.completed_at, 'YYYY-MM') as period,
         COUNT(*) as completed
       FROM activity_logs l
       JOIN activities a ON l.activity_id = a.id
       WHERE l.user_id = $1
         AND a.category = 'task'
         AND l.status = 'done'
         AND l.completed_at >= NOW() - ($2 || ' months')::INTERVAL
       GROUP BY TO_CHAR(l.completed_at, 'YYYY-MM')
       ORDER BY period ASC`,
      [userId, months]
    )

    res.json(result.rows.map(row => ({
      period: row.period,
      completed: parseInt(row.completed)
    })))
  } catch (err) {
    console.error('Task trends error:', err)
    res.status(500).json({ error: 'Failed to get task trends data' })
  }
})

// GET /api/analytics/activity-history/:activityId
// All logs for a specific activity
router.get('/activity-history/:activityId', async (req, res) => {
  try {
    const { activityId } = req.params
    const userId = req.user.id

    // Verify activity belongs to user
    const activityCheck = await pool.query(
      'SELECT id, title, category FROM activities WHERE id = $1 AND user_id = $2',
      [activityId, userId]
    )
    if (activityCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const result = await pool.query(
      `SELECT l.id, l.status, l.period, l.due_date, l.completed_at, l.metadata, l.created_at
       FROM activity_logs l
       WHERE l.activity_id = $1 AND l.user_id = $2
       ORDER BY l.created_at DESC`,
      [activityId, userId]
    )

    res.json({
      activity: activityCheck.rows[0],
      logs: result.rows
    })
  } catch (err) {
    console.error('Activity history error:', err)
    res.status(500).json({ error: 'Failed to get activity history' })
  }
})

export default router
