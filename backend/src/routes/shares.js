import { Router } from 'express'
import pool from '../db/pool.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()
router.use(authMiddleware)

// Middleware: verify the requesting user has access to ownerUserId's brain
async function requireShareAccess(req, res, next, permission = 'read') {
  const { ownerUserId } = req.params
  const userId = req.user.id

  if (ownerUserId === userId) {
    req.sharedOwnerId = userId
    return next()
  }

  try {
    const result = await pool.query(
      `SELECT permission FROM brain_shares
       WHERE owner_user_id = $1 AND shared_with_user_id = $2`,
      [ownerUserId, userId]
    )

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const share = result.rows[0]
    if (permission === 'read_write' && share.permission !== 'read_write') {
      return res.status(403).json({ error: 'Write access required' })
    }

    req.sharedOwnerId = ownerUserId
    next()
  } catch (err) {
    console.error('Share access check error:', err)
    res.status(500).json({ error: 'Failed to verify access' })
  }
}

// GET /api/shares - List shares I created + brains shared with me
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id

    // Brains I've shared with others
    const sharedByMe = await pool.query(
      `SELECT bs.id, bs.shared_with_user_id, bs.permission, bs.created_at,
              u.name as shared_with_name, u.email as shared_with_email
       FROM brain_shares bs
       JOIN users u ON bs.shared_with_user_id = u.id
       WHERE bs.owner_user_id = $1
       ORDER BY bs.created_at DESC`,
      [userId]
    )

    // Brains shared with me
    const sharedWithMe = await pool.query(
      `SELECT bs.id, bs.owner_user_id, bs.permission, bs.created_at,
              u.name as owner_name, u.email as owner_email
       FROM brain_shares bs
       JOIN users u ON bs.owner_user_id = u.id
       WHERE bs.shared_with_user_id = $1
       ORDER BY bs.created_at DESC`,
      [userId]
    )

    res.json({
      sharedByMe: sharedByMe.rows,
      sharedWithMe: sharedWithMe.rows
    })
  } catch (err) {
    console.error('Get shares error:', err)
    res.status(500).json({ error: 'Failed to get shares' })
  }
})

// POST /api/shares - Share brain with user by email
router.post('/', async (req, res) => {
  try {
    const { email, permission = 'read' } = req.body
    const userId = req.user.id

    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const validPermissions = ['read', 'read_write']
    if (!validPermissions.includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission level' })
    }

    // Look up the user by email
    const targetUser = await pool.query(
      'SELECT id, name, email FROM users WHERE email = LOWER($1)',
      [email.trim()]
    )

    if (targetUser.rows.length === 0) {
      // Return generic error to avoid revealing registration status
      return res.status(404).json({ error: 'User not found' })
    }

    const targetUserId = targetUser.rows[0].id

    if (targetUserId === userId) {
      return res.status(400).json({ error: 'Cannot share with yourself' })
    }

    // Insert or update the share
    const result = await pool.query(
      `INSERT INTO brain_shares (owner_user_id, shared_with_user_id, permission)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_user_id, shared_with_user_id)
       DO UPDATE SET permission = $3
       RETURNING *`,
      [userId, targetUserId, permission]
    )

    res.status(201).json({
      ...result.rows[0],
      shared_with_name: targetUser.rows[0].name,
      shared_with_email: targetUser.rows[0].email
    })
  } catch (err) {
    console.error('Create share error:', err)
    res.status(500).json({ error: 'Failed to create share' })
  }
})

// PATCH /api/shares/:shareId - Change permission
router.patch('/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params
    const { permission } = req.body
    const userId = req.user.id

    const validPermissions = ['read', 'read_write']
    if (!validPermissions.includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission level' })
    }

    const result = await pool.query(
      `UPDATE brain_shares SET permission = $1
       WHERE id = $2 AND owner_user_id = $3
       RETURNING *`,
      [permission, shareId, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error('Update share error:', err)
    res.status(500).json({ error: 'Failed to update share' })
  }
})

// DELETE /api/shares/:shareId - Revoke share
router.delete('/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params
    const userId = req.user.id

    // Owner can delete any share they created; shared user can remove themselves
    const result = await pool.query(
      `DELETE FROM brain_shares
       WHERE id = $1 AND (owner_user_id = $2 OR shared_with_user_id = $2)
       RETURNING id`,
      [shareId, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Delete share error:', err)
    res.status(500).json({ error: 'Failed to delete share' })
  }
})

// GET /api/shares/:ownerUserId/dashboard - Shared brain dashboard
router.get('/:ownerUserId/dashboard', async (req, res, next) => {
  await requireShareAccess(req, res, () => {}, 'read')
  if (res.headersSent) return

  try {
    // Proxy to same dashboard logic but for the owner's user ID
    const ownerId = req.sharedOwnerId || req.params.ownerUserId
    const currentPeriod = new Date().toISOString().slice(0, 7)
    const now = new Date()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const [billsResult, eventsResult, upcomingResult, overdueResult] = await Promise.all([
      pool.query(
        `SELECT a.id, a.title, a.category, a.recurrence_day,
                COALESCE(
                  (SELECT l.status FROM activity_logs l
                   WHERE l.activity_id = a.id AND l.period = $2
                   ORDER BY l.created_at DESC LIMIT 1),
                  'pending'
                ) as status
         FROM activities a
         WHERE a.user_id = $1 AND a.recurrence = 'monthly' AND a.is_active = true
         ORDER BY a.recurrence_day ASC NULLS LAST, a.title ASC`,
        [ownerId, currentPeriod]
      ),
      pool.query(
        `SELECT l.id as log_id, a.id as activity_id, a.title, l.due_date, l.metadata
         FROM activity_logs l
         JOIN activities a ON l.activity_id = a.id
         WHERE l.user_id = $1 AND a.category = 'event'
           AND a.is_active = true
           AND l.status = 'pending' AND l.due_date >= $2
         ORDER BY l.due_date ASC LIMIT 10`,
        [ownerId, now.toISOString()]
      ),
      pool.query(
        `SELECT l.id as log_id, a.id as activity_id, a.title, a.category, l.status, l.due_date, l.metadata
         FROM activity_logs l
         JOIN activities a ON l.activity_id = a.id
         WHERE l.user_id = $1 AND a.category != 'event'
           AND l.status = 'pending' AND l.due_date >= $2 AND l.due_date < $3
         ORDER BY l.due_date ASC`,
        [ownerId, today.toISOString(), nextWeek.toISOString()]
      ),
      pool.query(
        `SELECT l.id as log_id, a.id as activity_id, a.title, a.category, l.status, l.due_date
         FROM activity_logs l
         JOIN activities a ON l.activity_id = a.id
         WHERE l.user_id = $1 AND a.category != 'event'
           AND l.status = 'pending' AND l.due_date < $2
         ORDER BY l.due_date ASC`,
        [ownerId, today.toISOString()]
      )
    ])

    res.json({
      currentPeriod,
      bills: billsResult.rows,
      events: eventsResult.rows,
      upcoming: upcomingResult.rows,
      overdue: overdueResult.rows,
      isSharedView: true,
      ownerUserId: ownerId
    })
  } catch (err) {
    console.error('Shared dashboard error:', err)
    res.status(500).json({ error: 'Failed to get shared dashboard' })
  }
})

// GET /api/shares/:ownerUserId/activities - Shared brain activities
router.get('/:ownerUserId/activities', async (req, res) => {
  await requireShareAccess(req, res, () => {}, 'read')
  if (res.headersSent) return

  try {
    const ownerId = req.sharedOwnerId || req.params.ownerUserId
    const currentPeriod = new Date().toISOString().slice(0, 7)

    const result = await pool.query(
      `SELECT a.id, a.title, a.category, a.recurrence, a.recurrence_day, a.is_active, a.created_at,
              COALESCE(
                (SELECT l.status FROM activity_logs l
                 WHERE l.activity_id = a.id AND l.period = $2
                 ORDER BY l.created_at DESC LIMIT 1),
                'pending'
              ) as current_status
       FROM activities a
       WHERE a.user_id = $1 AND a.is_active = true
       ORDER BY a.created_at DESC`,
      [ownerId, currentPeriod]
    )

    res.json(result.rows)
  } catch (err) {
    console.error('Shared activities error:', err)
    res.status(500).json({ error: 'Failed to get shared activities' })
  }
})

// PATCH /api/shares/:ownerUserId/log/:logId - Update log (read_write only)
router.patch('/:ownerUserId/log/:logId', async (req, res) => {
  await requireShareAccess(req, res, () => {}, 'read_write')
  if (res.headersSent) return

  try {
    const ownerId = req.sharedOwnerId || req.params.ownerUserId
    const { logId } = req.params
    const { status } = req.body

    const validStatuses = ['done', 'pending', 'skipped']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    // Verify log belongs to the owner
    const logCheck = await pool.query(
      'SELECT id FROM activity_logs WHERE id = $1 AND user_id = $2',
      [logId, ownerId]
    )
    if (logCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Log not found' })
    }

    const completedAt = status === 'done' ? 'NOW()' : 'NULL'
    const result = await pool.query(
      `UPDATE activity_logs
       SET status = $1, completed_at = ${completedAt}
       WHERE id = $2
       RETURNING *`,
      [status, logId]
    )

    res.json(result.rows[0])
  } catch (err) {
    console.error('Shared log update error:', err)
    res.status(500).json({ error: 'Failed to update log' })
  }
})

export default router
