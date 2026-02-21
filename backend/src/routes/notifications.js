import { Router } from 'express'
import pool from '../db/pool.js'
import { authMiddleware } from '../middleware/auth.js'
import { generateNotificationsForUser } from '../services/notificationGenerator.js'

const router = Router()
router.use(authMiddleware)

// GET /api/notifications - Latest 20 unread notifications
router.get('/', async (req, res) => {
  try {
    // Eagerly generate notifications before returning (keeps them current)
    await generateNotificationsForUser(req.user.id).catch(err =>
      console.error('[notifications] Eager generation error:', err.message)
    )

    const result = await pool.query(
      `SELECT id, type, title, body, activity_id, log_id, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    )

    const unreadCount = result.rows.filter(n => !n.is_read).length

    res.json({ notifications: result.rows, unreadCount })
  } catch (err) {
    console.error('Get notifications error:', err)
    res.status(500).json({ error: 'Failed to get notifications' })
  }
})

// PATCH /api/notifications/:id/read - Mark one as read
router.patch('/:id/read', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Mark notification read error:', err)
    res.status(500).json({ error: 'Failed to mark notification as read' })
  }
})

// PATCH /api/notifications/read-all - Mark all as read
router.patch('/read-all', async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('Mark all read error:', err)
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
})

// DELETE /api/notifications/:id - Dismiss notification
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Delete notification error:', err)
    res.status(500).json({ error: 'Failed to delete notification' })
  }
})

export default router
