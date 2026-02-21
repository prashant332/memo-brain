import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

import authRoutes from './routes/auth.js'
import settingsRoutes from './routes/settings.js'
import activitiesRoutes from './routes/activities.js'
import chatRoutes from './routes/chat.js'
import analyticsRoutes from './routes/analytics.js'
import notificationsRoutes from './routes/notifications.js'
import sharesRoutes from './routes/shares.js'
import { initCron } from './services/cron.js'

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
app.use('/api/chat', chatRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/shares', sharesRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
  initCron()
})
