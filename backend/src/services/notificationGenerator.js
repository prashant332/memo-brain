import pool from '../db/pool.js'

// Generate notifications for overdue and upcoming items for a specific user
export async function generateNotificationsForUser(userId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in3Days = new Date(today)
  in3Days.setDate(in3Days.getDate() + 3)

  // Overdue tasks (non-events, pending, due before today)
  const overdueResult = await pool.query(
    `SELECT l.id as log_id, a.id as activity_id, a.title, a.category
     FROM activity_logs l
     JOIN activities a ON l.activity_id = a.id
     WHERE l.user_id = $1
       AND a.category != 'event'
       AND l.status = 'pending'
       AND l.due_date < $2`,
    [userId, today.toISOString()]
  )

  // Upcoming bills/tasks in next 3 days
  const upcomingResult = await pool.query(
    `SELECT l.id as log_id, a.id as activity_id, a.title, a.category
     FROM activity_logs l
     JOIN activities a ON l.activity_id = a.id
     WHERE l.user_id = $1
       AND l.status = 'pending'
       AND l.due_date >= $2
       AND l.due_date < $3`,
    [userId, today.toISOString(), in3Days.toISOString()]
  )

  const notifications = []

  for (const item of overdueResult.rows) {
    const type = item.category === 'bill' ? 'overdue_bill' : 'overdue_task'
    notifications.push({
      user_id: userId,
      type,
      title: `Overdue: ${item.title}`,
      body: `${item.title} is past due.`,
      activity_id: item.activity_id,
      log_id: item.log_id
    })
  }

  for (const item of upcomingResult.rows) {
    const type = item.category === 'bill' ? 'upcoming_bill' : 'upcoming_task'
    notifications.push({
      user_id: userId,
      type,
      title: `Due soon: ${item.title}`,
      body: `${item.title} is due in the next 3 days.`,
      activity_id: item.activity_id,
      log_id: item.log_id
    })
  }

  // Also check for pending monthly bills (no due_date) in current period
  const currentPeriod = new Date().toISOString().slice(0, 7)
  const pendingBillsResult = await pool.query(
    `SELECT a.id as activity_id, a.title,
            COALESCE(
              (SELECT l.id FROM activity_logs l
               WHERE l.activity_id = a.id AND l.period = $2
               ORDER BY l.created_at DESC LIMIT 1),
              NULL
            ) as log_id,
            COALESCE(
              (SELECT l.status FROM activity_logs l
               WHERE l.activity_id = a.id AND l.period = $2
               ORDER BY l.created_at DESC LIMIT 1),
              'pending'
            ) as status
     FROM activities a
     WHERE a.user_id = $1
       AND a.recurrence = 'monthly'
       AND a.category = 'bill'
       AND a.is_active = true`,
    [userId, currentPeriod]
  )

  for (const bill of pendingBillsResult.rows) {
    if (bill.status === 'pending' && bill.log_id) {
      notifications.push({
        user_id: userId,
        type: 'pending_bill',
        title: `Bill pending: ${bill.title}`,
        body: `${bill.title} is still unpaid this month.`,
        activity_id: bill.activity_id,
        log_id: bill.log_id
      })
    }
  }

  // Insert with ON CONFLICT DO NOTHING for deduplication
  let created = 0
  for (const n of notifications) {
    if (!n.log_id) continue // skip if no log_id (needed for dedup constraint)
    try {
      const result = await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, activity_id, log_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, log_id, type) DO NOTHING
         RETURNING id`,
        [n.user_id, n.type, n.title, n.body, n.activity_id, n.log_id]
      )
      if (result.rows.length > 0) created++
    } catch (err) {
      console.error('[notifications] Insert error:', err.message)
    }
  }

  return created
}

// Run notification generation for all users (called from cron)
export async function generateAllNotifications() {
  console.log('[notifications] Generating notifications for all users')
  try {
    const usersResult = await pool.query('SELECT id FROM users')
    let total = 0
    for (const user of usersResult.rows) {
      const created = await generateNotificationsForUser(user.id)
      total += created
    }
    console.log(`[notifications] Created ${total} new notifications`)
  } catch (err) {
    console.error('[notifications] Error in batch generation:', err)
  }
}
