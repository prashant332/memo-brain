import cron from 'node-cron'
import pool from '../db/pool.js'
import { generateAllNotifications } from './notificationGenerator.js'

// Create pending logs for all recurring activities that have no log for the given period
export async function createRecurringLogs(period) {
  console.log(`[cron] Creating recurring logs for period: ${period}`)

  try {
    // Find all recurring activities with no log for the given period
    const activitiesResult = await pool.query(
      `SELECT a.id, a.user_id FROM activities a
       WHERE a.recurrence = 'monthly'
         AND a.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM activity_logs l
           WHERE l.activity_id = a.id AND l.period = $1
         )`,
      [period]
    )

    const activities = activitiesResult.rows
    if (activities.length === 0) {
      console.log(`[cron] No recurring activities need logs for ${period}`)
      return { created: 0 }
    }

    // Insert pending logs in batches of 50
    const BATCH_SIZE = 50
    let created = 0

    for (let i = 0; i < activities.length; i += BATCH_SIZE) {
      const batch = activities.slice(i, i + BATCH_SIZE)
      for (const activity of batch) {
        await pool.query(
          `INSERT INTO activity_logs (activity_id, user_id, status, period)
           VALUES ($1, $2, 'pending', $3)
           ON CONFLICT DO NOTHING`,
          [activity.id, activity.user_id, period]
        )
        created++
      }
    }

    console.log(`[cron] Created ${created} recurring logs for ${period}`)
    return { created }
  } catch (err) {
    console.error('[cron] Error creating recurring logs:', err)
    throw err
  }
}

// Initialize cron jobs and run startup check
export function initCron() {
  // Run on startup for current period (idempotent — safe to run multiple times)
  const currentPeriod = new Date().toISOString().slice(0, 7)
  createRecurringLogs(currentPeriod).catch(err =>
    console.error('[cron] Startup recurring log creation failed:', err)
  )

  // Schedule: midnight on the 1st of every month
  cron.schedule('0 0 1 * *', () => {
    const period = new Date().toISOString().slice(0, 7)
    createRecurringLogs(period).catch(err =>
      console.error('[cron] Scheduled recurring log creation failed:', err)
    )
  })

  // Schedule: daily at 8am — generate notifications for all users
  cron.schedule('0 8 * * *', () => {
    generateAllNotifications().catch(err =>
      console.error('[cron] Daily notification generation failed:', err)
    )
  })

  console.log('[cron] Initialized — recurring logs: 1st of month | notifications: daily 8am')
}
