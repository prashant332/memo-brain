# Phase 4: Chat System & AI Integration

> The core chat functionality with multi-provider AI (Claude/OpenAI), message parsing, and action execution.

---

## Goals
- [ ] Chat sessions CRUD routes
- [ ] Message endpoint with AI integration
- [ ] Multi-provider AI service (Claude + OpenAI)
- [ ] Action parsing and activity logging
- [ ] Session sidebar component
- [ ] Message bubble component
- [ ] Complete ChatPage layout

---

## 4.1 AI Service Abstraction

### backend/src/services/ai.js
```js
import pool from '../db/pool.js'
import { decrypt } from '../utils/encryption.js'

// System prompt template
const SYSTEM_PROMPT = `You are MemoBrain, a personal memory assistant. You help users log daily activities,
track bills and tasks, and answer questions about what they've done or need to do.

TODAY'S DATE: {{TODAY_DATE}}
CURRENT MONTH: {{CURRENT_MONTH}}

CURRENT USER CONTEXT:
{{USER_CONTEXT}}

YOUR JOB:
1. Understand what the user is saying naturally
2. Respond in a friendly, concise way (1-3 sentences)
3. ALWAYS end your response with a JSON action block

INTENT TYPES:
- "log_done"    → user completed something ("paid bill", "visited bank")
- "log_pending" → user plans to do something ("going to bank tomorrow")
- "log_event"   → future event ("birthday on March 5")
- "query"       → asking a question ("did I pay electricity?")
- "none"        → casual chat, no action needed

CATEGORIES: bill | task | event | note

ALWAYS end your response with this exact format (raw JSON after the separator):
===ACTION===
{
  "intent": "log_done|log_pending|log_event|query|none",
  "activity_title": "Clean title or null",
  "category": "bill|task|event|note|null",
  "recurrence": "monthly|weekly|yearly|null",
  "due_date": "ISO date string or null",
  "period": "YYYY-MM or null",
  "notes": "extra context or null",
  "query_type": "current_status|upcoming|history|overdue|null"
}

IMPORTANT:
- For bills, always detect if it's a monthly recurring bill
- For scheduled tasks, extract the due date from natural language ("Friday", "tomorrow", "March 5th")
- When answering queries, use the context provided to give accurate answers
- Keep responses natural and helpful`

// Build system prompt with context
function buildSystemPrompt(userContext) {
  const today = new Date()
  const todayDate = today.toISOString().split('T')[0]
  const currentMonth = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return SYSTEM_PROMPT
    .replace('{{TODAY_DATE}}', todayDate)
    .replace('{{CURRENT_MONTH}}', currentMonth)
    .replace('{{USER_CONTEXT}}', JSON.stringify(userContext, null, 2))
}

// Get user context for AI
export async function getUserContext(userId) {
  const currentPeriod = new Date().toISOString().slice(0, 7)

  // Monthly bills with status
  const billsResult = await pool.query(
    `SELECT a.title, a.category, a.recurrence,
       COALESCE(
         (SELECT l.status FROM activity_logs l
          WHERE l.activity_id = a.id AND l.period = $2
          ORDER BY l.created_at DESC LIMIT 1),
         'pending'
       ) as status
     FROM activities a
     WHERE a.user_id = $1 AND a.recurrence = 'monthly' AND a.is_active = true`,
    [userId, currentPeriod]
  )

  // Pending tasks
  const tasksResult = await pool.query(
    `SELECT a.title, a.category, l.due_date, l.status, l.notes
     FROM activity_logs l
     JOIN activities a ON l.activity_id = a.id
     WHERE l.user_id = $1 AND l.status = 'pending'
     ORDER BY l.due_date ASC NULLS LAST LIMIT 10`,
    [userId]
  )

  return {
    currentPeriod,
    monthlyBills: billsResult.rows,
    pendingTasks: tasksResult.rows.map(t => ({
      ...t,
      due_date: t.due_date ? t.due_date.toISOString() : null
    }))
  }
}

// Get user's AI settings
export async function getUserAISettings(userId) {
  const result = await pool.query(
    'SELECT ai_provider, api_key_enc FROM user_settings WHERE user_id = $1',
    [userId]
  )

  if (result.rows.length === 0) {
    return { provider: null, apiKey: null }
  }

  const { ai_provider, api_key_enc } = result.rows[0]

  return {
    provider: ai_provider,
    apiKey: api_key_enc ? decrypt(api_key_enc) : null
  }
}

// Call Claude API
async function callClaude(apiKey, systemPrompt, messages) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  })

  return response.content[0].text
}

// Call OpenAI API
async function callOpenAI(apiKey, systemPrompt, messages) {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ]
  })

  return response.choices[0].message.content
}

// Main AI call function
export async function callAI(userId, messages) {
  // Get user's AI settings
  const { provider, apiKey } = await getUserAISettings(userId)

  if (!apiKey) {
    throw new Error('No API key configured. Please add your API key in Settings.')
  }

  // Get user context
  const userContext = await getUserContext(userId)

  // Build system prompt
  const systemPrompt = buildSystemPrompt(userContext)

  // Call appropriate AI provider
  let rawResponse
  if (provider === 'openai') {
    rawResponse = await callOpenAI(apiKey, systemPrompt, messages)
  } else {
    // Default to Claude
    rawResponse = await callClaude(apiKey, systemPrompt, messages)
  }

  return rawResponse
}

// Parse AI response into message and action
export function parseAIResponse(rawContent) {
  const separator = '===ACTION==='
  const parts = rawContent.split(separator)

  const message = parts[0].trim()
  let action = null

  if (parts[1]) {
    try {
      // Clean up the JSON (remove markdown code blocks if present)
      let jsonStr = parts[1].trim()
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7)
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3)
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3)
      }
      action = JSON.parse(jsonStr.trim())
    } catch (e) {
      console.warn('Failed to parse action JSON:', e.message)
    }
  }

  return { message, action }
}
```

---

## 4.2 Chat Routes

### backend/src/routes/chat.js
```js
import { Router } from 'express'
import pool from '../db/pool.js'
import { authMiddleware } from '../middleware/auth.js'
import { callAI, parseAIResponse } from '../services/ai.js'

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
    const { content } = req.body

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
    const { message, action } = parseAIResponse(rawResponse)

    // Execute action if needed
    let actionResult = null
    if (action && action.intent && !['none', 'query'].includes(action.intent)) {
      actionResult = await executeAction(req.user.id, action)
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

    res.json({
      message: assistantResult.rows[0],
      action,
      actionResult
    })
  } catch (err) {
    console.error('Send message error:', err)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// Execute action from AI response
async function executeAction(userId, action) {
  try {
    const { intent, activity_title, category, recurrence, due_date, period, notes } = action

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

    // Create log entry
    const completedAt = status === 'done' ? new Date().toISOString() : null
    const logResult = await pool.query(
      `INSERT INTO activity_logs (activity_id, user_id, status, period, notes, due_date, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [activityId, userId, status, logPeriod, notes, due_date, completedAt]
    )

    return {
      success: true,
      activity_id: activityId,
      log_id: logResult.rows[0].id,
      status
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
import chatRoutes from './routes/chat.js'

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

## 4.3 Frontend Components

### frontend/src/components/SessionSidebar.jsx
```jsx
import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'

export default function SessionSidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
  onNavigateSettings
}) {
  const { user, logout } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/sessions')
      setSessions(data)
    } catch (err) {
      console.error('Load sessions error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()

    // Expose reload function globally
    window.__reloadSessions = loadSessions
    return () => {
      delete window.__reloadSessions
    }
  }, [loadSessions])

  // Reload when session changes
  useEffect(() => {
    if (currentSessionId) {
      loadSessions()
    }
  }, [currentSessionId, loadSessions])

  const formatTime = (dateStr) => {
    try {
      return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
    } catch {
      return ''
    }
  }

  return (
    <aside className="w-72 h-full bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <button
          onClick={onNewSession}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">
            No conversations yet
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  currentSessionId === session.id
                    ? 'bg-primary-500/20 border border-primary-500/30'
                    : 'hover:bg-slate-800'
                }`}
              >
                <p className="font-medium truncate text-sm">
                  {session.title || 'New Session'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatTime(session.started_at)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer - User Info */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 font-medium">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{user?.name}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={onNavigateSettings}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={logout}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-error-400"
              title="Sign out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
```

### frontend/src/components/MessageBubble.jsx
```jsx
import { format, parseISO } from 'date-fns'
import CategoryBadge from './CategoryBadge'

const intentLabels = {
  log_done: { text: 'Logged', color: 'text-success-400', icon: '✓' },
  log_pending: { text: 'Scheduled', color: 'text-primary-400', icon: '◷' },
  log_event: { text: 'Event added', color: 'text-purple-400', icon: '★' },
  query: { text: 'Query', color: 'text-slate-400', icon: '?' }
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const metadata = message.metadata || {}
  const action = metadata.action
  const actionResult = metadata.actionResult

  const showActionPill = action && action.intent && action.intent !== 'none'
  const intentInfo = showActionPill ? intentLabels[action.intent] : null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <div className={`max-w-[85%] md:max-w-[70%] ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Message Bubble */}
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-primary-500 text-white rounded-br-md'
              : 'bg-slate-800 text-slate-100 rounded-bl-md'
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {/* Action Pill (for assistant messages with actions) */}
        {!isUser && showActionPill && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`text-xs font-medium ${intentInfo?.color}`}>
              {intentInfo?.icon} {intentInfo?.text}
            </span>
            {action.activity_title && (
              <span className="text-xs text-slate-500">
                {action.activity_title}
              </span>
            )}
            {action.category && (
              <CategoryBadge category={action.category} />
            )}
            {actionResult && !actionResult.success && (
              <span className="text-xs text-error-400">
                (Failed: {actionResult.error})
              </span>
            )}
          </div>
        )}

        {/* Error indicator */}
        {!isUser && metadata.error && (
          <div className="mt-2">
            <span className="text-xs text-error-400">⚠ Error occurred</span>
          </div>
        )}

        {/* Timestamp */}
        <p className={`text-xs text-slate-500 mt-1.5 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.created_at ? format(parseISO(message.created_at), 'h:mm a') : ''}
        </p>
      </div>
    </div>
  )
}
```

### frontend/src/components/TypingIndicator.jsx
```jsx
export default function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-bl-md">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}
```

---

## 4.4 ChatPage Component

### frontend/src/pages/ChatPage.jsx
```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import SessionSidebar from '../components/SessionSidebar'
import DashboardStrip from '../components/DashboardStrip'
import MessageBubble from '../components/MessageBubble'
import TypingIndicator from '../components/TypingIndicator'

const SUGGESTIONS = [
  'Paid electricity bill today',
  'Remind me to visit bank on Friday',
  'What bills are pending this month?',
  'Schedule dentist appointment for next week',
  'Did I pay the water bill?'
]

export default function ChatPage() {
  const navigate = useNavigate()

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Session state
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  // Input state
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // Refs
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Load messages when session changes
  useEffect(() => {
    if (sessionId) {
      loadMessages(sessionId)
    } else {
      setMessages([])
    }
  }, [sessionId])

  const loadMessages = async (sessId) => {
    setLoading(true)
    try {
      const { data } = await api.get(`/chat/sessions/${sessId}/messages`)
      setMessages(data)
    } catch (err) {
      console.error('Load messages error:', err)
    } finally {
      setLoading(false)
    }
  }

  const createSession = async () => {
    try {
      const { data } = await api.post('/chat/sessions')
      return data.id
    } catch (err) {
      console.error('Create session error:', err)
      throw err
    }
  }

  const handleNewSession = async () => {
    setSessionId(null)
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  const handleSelectSession = (sessId) => {
    setSessionId(sessId)
  }

  const handleSend = async (text = input) => {
    const messageText = text.trim()
    if (!messageText || sending) return

    setSending(true)

    try {
      // Ensure we have a session
      let currentSessionId = sessionId
      if (!currentSessionId) {
        currentSessionId = await createSession()
        setSessionId(currentSessionId)
      }

      // Optimistic user message
      const optimisticMsg = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: messageText,
        created_at: new Date().toISOString()
      }
      setMessages((prev) => [...prev, optimisticMsg])
      setInput('')

      // Send to API
      const { data } = await api.post(`/chat/sessions/${currentSessionId}/message`, {
        content: messageText
      })

      // Replace optimistic message and add assistant response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== optimisticMsg.id)
        return [
          ...filtered,
          { ...optimisticMsg, id: `user-${Date.now()}` },
          data.message
        ]
      })

      // Reload dashboard and sessions if action was taken
      if (data.action && !['none', 'query'].includes(data.action.intent)) {
        window.__reloadDashboard?.()
        window.__reloadSessions?.()
      }
    } catch (err) {
      console.error('Send error:', err)
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('temp-')))

      // Show error to user
      const errorMsg = err.response?.data?.error || 'Failed to send message'
      alert(errorMsg)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSuggestionClick = (suggestion) => {
    handleSend(suggestion)
  }

  return (
    <div className="h-screen flex overflow-hidden bg-slate-950">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-30 transition-transform duration-200 md:relative md:translate-x-0`}
      >
        <SessionSidebar
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onNavigateSettings={() => navigate('/settings')}
        />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-800 rounded-lg md:hidden"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div>
            <h1 className="font-semibold text-lg">MemoBrain</h1>
            <p className="text-xs text-slate-500">Your personal memory assistant</p>
          </div>
        </header>

        {/* Dashboard Strip */}
        <DashboardStrip />

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
            </div>
          ) : messages.length === 0 ? (
            // Empty state with suggestions
            <div className="h-full flex flex-col items-center justify-center">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-slate-200 mb-2">
                  What would you like to remember?
                </h2>
                <p className="text-slate-400 text-sm">
                  Type naturally or try one of these suggestions
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTIONS.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full text-sm text-slate-300 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {sending && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-slate-800 p-4 bg-slate-900/50">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="input-field resize-none pr-12 min-h-[48px] max-h-32"
                  style={{
                    height: 'auto',
                    minHeight: '48px'
                  }}
                  onInput={(e) => {
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
                  }}
                />
              </div>
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                className="btn-primary px-4 h-12 flex items-center justify-center"
              >
                {sending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## 4.5 Update App.jsx with ChatPage

### frontend/src/App.jsx
```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import ChatPage from './pages/ChatPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return user ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      } />
      <Route path="/" element={
        <ProtectedRoute>
          <ChatPage />
        </ProtectedRoute>
      } />
    </Routes>
  )
}
```

---

## 4.6 Verification Checklist

After Phase 4, verify:

**Backend:**
- [ ] GET `/api/chat/sessions` returns user's sessions
- [ ] POST `/api/chat/sessions` creates new session
- [ ] GET `/api/chat/sessions/:id/messages` returns session messages
- [ ] POST `/api/chat/sessions/:id/message` sends message and gets AI response
- [ ] Action parsing extracts intent from `===ACTION===` block
- [ ] Activity find-or-create works (case-insensitive)
- [ ] Log entries created for log_done/log_pending intents
- [ ] Session title updates from first message

**Frontend:**
- [ ] Sidebar shows session list
- [ ] "New Chat" button clears current session
- [ ] Clicking session loads its messages
- [ ] Empty state shows suggestion chips
- [ ] Clicking suggestion sends message
- [ ] User messages appear immediately (optimistic)
- [ ] Typing indicator shows while waiting
- [ ] Assistant messages show action pills when applicable
- [ ] Dashboard reloads after actions
- [ ] Sessions list reloads after new messages
- [ ] Mobile sidebar toggle works
- [ ] Enter sends, Shift+Enter adds newline

**AI Integration:**
- [ ] Claude API calls work with user's key
- [ ] OpenAI API calls work with user's key
- [ ] Error shown to user if no API key configured
- [ ] Graceful error handling for AI failures

---

## Files Created/Modified in Phase 4

**New Files:**
```
backend/src/services/ai.js
backend/src/routes/chat.js
frontend/src/components/SessionSidebar.jsx
frontend/src/components/MessageBubble.jsx
frontend/src/components/TypingIndicator.jsx
frontend/src/pages/ChatPage.jsx
```

**Modified Files:**
```
backend/src/index.js     # Add chat routes
frontend/src/App.jsx     # Add ChatPage route
```
