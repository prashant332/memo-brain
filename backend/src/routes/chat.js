import { Router } from 'express'
import pool from '../db/pool.js'
import { authMiddleware } from '../middleware/auth.js'
import { callAI, callAIWithQueryResults, parseAIResponse } from '../services/ai.js'

const router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/chat/sessions - List user's sessions
router.get('/sessions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        s.id,
        s.title,
        s.started_at,
        s.ended_at,
        (SELECT content FROM chat_messages
         WHERE session_id = s.id AND role = 'user'
         ORDER BY created_at ASC LIMIT 1) as first_message
      FROM chat_sessions s
      WHERE s.user_id = $1
      ORDER BY s.started_at DESC
      LIMIT 50`,
      [req.user.id]
    )

    res.json(result.rows)
  } catch (err) {
    console.error('Get sessions error:', err)
    res.status(500).json({ error: 'Failed to get sessions' })
  }
})

// POST /api/chat/sessions - Create new session
router.post('/sessions', async (req, res) => {
  try {
    const result = await pool.query(
      `INSERT INTO chat_sessions (user_id, title)
       VALUES ($1, 'New Session')
       RETURNING *`,
      [req.user.id]
    )

    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('Create session error:', err)
    res.status(500).json({ error: 'Failed to create session' })
  }
})

// GET /api/chat/sessions/:sessionId/messages - Get session messages
router.get('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params

    // Verify session belongs to user
    const sessionCheck = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.user.id]
    )
    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const result = await pool.query(
      `SELECT id, role, content, metadata, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    )

    res.json(result.rows)
  } catch (err) {
    console.error('Get messages error:', err)
    res.status(500).json({ error: 'Failed to get messages' })
  }
})

// POST /api/chat/sessions/:sessionId/message - Send message
router.post('/sessions/:sessionId/message', async (req, res) => {
  try {
    const { sessionId } = req.params
    const { content, timezoneOffset } = req.body

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Message content is required' })
    }

    // Verify session belongs to user
    const sessionCheck = await pool.query(
      'SELECT id, title FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.user.id]
    )
    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }

    // Save user message
    await pool.query(
      `INSERT INTO chat_messages (session_id, user_id, role, content)
       VALUES ($1, $2, 'user', $3)`,
      [sessionId, req.user.id, content.trim()]
    )

    // Fetch last 10 messages for context
    const historyResult = await pool.query(
      `SELECT role, content FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [sessionId]
    )
    const history = historyResult.rows.reverse()

    // Call AI
    let rawResponse
    try {
      rawResponse = await callAI(req.user.id, history)
    } catch (aiError) {
      console.error('AI call error:', aiError)

      // Save error message
      const errorMsg = aiError.message || 'AI service error'
      await pool.query(
        `INSERT INTO chat_messages (session_id, user_id, role, content, metadata)
         VALUES ($1, $2, 'assistant', $3, $4)`,
        [sessionId, req.user.id, `Sorry, I encountered an error: ${errorMsg}`, JSON.stringify({ error: true })]
      )

      return res.status(500).json({ error: errorMsg })
    }

    // Parse response
    let { message, action } = parseAIResponse(rawResponse)

    // If query intent, fetch real DB data and call AI again with results
    if (action?.intent === 'query') {
      try {
        const queryResults = await executeQuery(req.user.id, action)
        const secondResponse = await callAIWithQueryResults(req.user.id, history, queryResults)
        const parsed = parseAIResponse(secondResponse)
        message = parsed.message
        // Keep intent as query but merge any updated action fields
        action = { ...action, ...parsed.action, intent: 'query', query_results_used: true }
      } catch (queryErr) {
        console.error('Query execution error:', queryErr)
        // Fall through with original response if query fails
      }
    }

    // Execute action if needed
    let actionResult = null
    const loggingIntents = ['log_done', 'log_pending', 'log_event', 'add_details']
    if (action && action.intent && loggingIntents.includes(action.intent)) {
      actionResult = await executeAction(req.user.id, action, sessionId, timezoneOffset)
    }

    // Update session title if still default
    if (sessionCheck.rows[0].title === 'New Session') {
      const title = content.trim().slice(0, 60)
      await pool.query(
        'UPDATE chat_sessions SET title = $1 WHERE id = $2',
        [title, sessionId]
      )
    }

    // Save assistant message with metadata
    const assistantResult = await pool.query(
      `INSERT INTO chat_messages (session_id, user_id, role, content, metadata)
       VALUES ($1, $2, 'assistant', $3, $4)
       RETURNING id, role, content, metadata, created_at`,
      [sessionId, req.user.id, message, JSON.stringify({ action, actionResult })]
    )

    // Auto-close session only when user confirms they're done
    let sessionClosed = false
    if (action?.intent === 'confirm_done') {
      await pool.query('DELETE FROM chat_sessions WHERE id = $1', [sessionId])
      sessionClosed = true
    }

    res.json({
      message: assistantResult.rows[0],
      action,
      actionResult,
      sessionClosed
    })
  } catch (err) {
    console.error('Send message error:', err)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// Execute a DB query based on AI-detected query intent
async function executeQuery(userId, action) {
  const { query_type, activity_title, target_period } = action

  if (query_type === 'current_status') {
    // Use target_period if the user asked about a specific past month's bill status,
    // otherwise default to the current period.
    const period = target_period || new Date().toISOString().slice(0, 7)
    const result = await pool.query(
      `SELECT a.title, a.category, a.recurrence,
              COALESCE(
                (SELECT l.status FROM activity_logs l
                 WHERE l.activity_id = a.id AND l.period = $2
                 ORDER BY l.created_at DESC LIMIT 1),
                'pending'
              ) as status,
              (SELECT l.metadata FROM activity_logs l
               WHERE l.activity_id = a.id AND l.period = $2
               ORDER BY l.created_at DESC LIMIT 1) as metadata
       FROM activities a
       WHERE a.user_id = $1 AND a.recurrence = 'monthly' AND a.is_active = true
       ORDER BY a.title ASC`,
      [userId, period]
    )
    return { query_type, period, bills: result.rows }
  }

  if (query_type === 'overdue') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const result = await pool.query(
      `SELECT a.title, a.category, l.status, l.due_date, l.metadata
       FROM activity_logs l
       JOIN activities a ON l.activity_id = a.id
       WHERE l.user_id = $1 AND a.category != 'event'
         AND l.status = 'pending' AND l.due_date < $2
       ORDER BY l.due_date ASC`,
      [userId, today.toISOString()]
    )
    return { query_type, overdue: result.rows }
  }

  if (query_type === 'upcoming') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const result = await pool.query(
      `SELECT a.title, a.category, l.status, l.due_date, l.metadata
       FROM activity_logs l
       JOIN activities a ON l.activity_id = a.id
       WHERE l.user_id = $1 AND l.status = 'pending'
         AND l.due_date >= $2 AND l.due_date < $3
       ORDER BY l.due_date ASC`,
      [userId, today.toISOString(), nextWeek.toISOString()]
    )
    return { query_type, upcoming: result.rows }
  }

  // Default: history query, filtered by activity title and/or period(s)
  const { months_back } = action
  const params = [userId]
  const filters = []

  if (activity_title) {
    params.push(`%${activity_title}%`)
    filters.push(`LOWER(a.title) ILIKE LOWER($${params.length})`)
  }

  if (target_period) {
    // Single specific month
    params.push(target_period)
    filters.push(`l.period = $${params.length}`)
  } else if (months_back && months_back > 0) {
    // Multi-month range: build the list of YYYY-MM strings for the past N months
    const periods = []
    const now = new Date()
    for (let i = 0; i < months_back; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    params.push(periods)
    filters.push(`l.period = ANY($${params.length})`)
  }

  const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''
  const limit = (target_period || months_back || activity_title) ? 200 : 20

  const result = await pool.query(
    `SELECT a.title, a.category, l.status, l.period, l.metadata, l.completed_at, l.due_date, l.created_at
     FROM activity_logs l
     JOIN activities a ON l.activity_id = a.id
     WHERE l.user_id = $1 ${whereClause}
     ORDER BY l.period DESC, l.created_at DESC LIMIT ${limit}`,
    params
  )
  return { query_type: 'history', activity_title, target_period, months_back, logs: result.rows }
}

// Store session context for follow-up details
const sessionContext = new Map()

// Generate consecutive YYYY-MM period strings starting from startPeriod
function getAdvancePeriods(startPeriod, months) {
  const [year, month] = startPeriod.split('-').map(Number)
  const periods = []
  for (let i = 0; i < months; i++) {
    const d = new Date(year, month - 1 + i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    periods.push(`${y}-${m}`)
  }
  return periods
}

// Convert a naive local datetime string to UTC ISO string using the browser's timezone offset.
// timezoneOffset is new Date().getTimezoneOffset() from the browser
// (negative for UTC+, e.g. IST = UTC+5:30 → offset = -330).
function localDateToUTC(naiveDateStr, timezoneOffset) {
  if (
    !naiveDateStr ||
    typeof timezoneOffset !== 'number' ||
    naiveDateStr.endsWith('Z') ||
    /[+-]\d{2}:\d{2}$/.test(naiveDateStr)
  ) {
    return naiveDateStr
  }
  // Treat the naive string as UTC momentarily just for parsing, then shift by the offset.
  // UTC = local_time - utcOffsetMinutes = local_time + browserTimezoneOffset_minutes
  const localMs = new Date(naiveDateStr + 'Z').getTime()
  const utcMs = localMs + timezoneOffset * 60000
  return new Date(utcMs).toISOString()
}

// Execute action from AI response
async function executeAction(userId, action, sessionId, timezoneOffset) {
  try {
    const { intent, activity_title, category, recurrence, period, notes, metadata, advance_months } = action
    const due_date = localDateToUTC(action.due_date, timezoneOffset)

    // Handle add_details - update existing log in this session
    if (intent === 'add_details') {
      const context = sessionContext.get(sessionId)
      if (context?.log_id) {
        // Merge all data (including notes) into metadata
        const newData = { ...metadata }
        if (notes) {
          newData.notes = notes
        }

        if (Object.keys(newData).length > 0) {
          await pool.query(
            `UPDATE activity_logs
             SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
             WHERE id = $2`,
            [JSON.stringify(newData), context.log_id]
          )
        }

        return { success: true, updated: true, log_id: context.log_id }
      }
      return { success: false, error: 'No active log to update' }
    }

    if (!activity_title) {
      return { success: false, error: 'No activity title provided' }
    }

    // Find or create activity (case-insensitive match)
    let activityId
    const existing = await pool.query(
      `SELECT id FROM activities
       WHERE user_id = $1 AND LOWER(title) = LOWER($2) AND is_active = true
       LIMIT 1`,
      [userId, activity_title]
    )

    if (existing.rows.length > 0) {
      activityId = existing.rows[0].id
    } else {
      // Create new activity
      const newActivity = await pool.query(
        `INSERT INTO activities (user_id, title, category, recurrence)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, activity_title, category || 'task', recurrence || null]
      )
      activityId = newActivity.rows[0].id
    }

    // Determine status from intent
    let status = 'pending'
    if (intent === 'log_done') {
      status = 'done'
    }

    // Determine period (default to current month for monthly bills)
    const logPeriod = period || new Date().toISOString().slice(0, 7)

    // Build metadata (including notes if provided)
    const logMetadata = { ...metadata }
    if (notes) {
      logMetadata.notes = notes
    }

    // For advance payments, create one log entry per covered month
    const months = (status === 'done' && advance_months > 1) ? advance_months : 1
    const periods = getAdvancePeriods(logPeriod, months)
    const completedAt = status === 'done' ? new Date().toISOString() : null

    let firstLogId
    for (const p of periods) {
      const logResult = await pool.query(
        `INSERT INTO activity_logs (activity_id, user_id, status, period, due_date, completed_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [activityId, userId, status, p, due_date, completedAt, JSON.stringify(logMetadata)]
      )
      if (!firstLogId) firstLogId = logResult.rows[0].id
    }

    // Store context for follow-up details (linked to first log)
    sessionContext.set(sessionId, {
      activity_id: activityId,
      log_id: firstLogId,
      activity_title,
      category
    })

    return {
      success: true,
      activity_id: activityId,
      log_id: firstLogId,
      status,
      periods_logged: periods
    }
  } catch (err) {
    console.error('Execute action error:', err)
    return { success: false, error: err.message }
  }
}

// DELETE /api/chat/sessions/:sessionId - Delete session
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    const result = await pool.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
      [sessionId, req.user.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Delete session error:', err)
    res.status(500).json({ error: 'Failed to delete session' })
  }
})

export default router
