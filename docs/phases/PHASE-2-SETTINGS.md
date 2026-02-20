# Phase 2: Settings & AI Configuration

> User settings page with AI provider selection (Claude/OpenAI) and secure token storage.

---

## Goals
- [ ] Settings page UI with provider toggle
- [ ] API key input with secure storage
- [ ] Backend routes for settings CRUD
- [ ] Token encryption/decryption flow
- [ ] Navigation to settings from main app

---

## 2.1 Backend Routes

### backend/src/routes/settings.js
```js
import { Router } from 'express'
import pool from '../db/pool.js'
import { encrypt, decrypt } from '../utils/encryption.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/settings - Get user settings
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ai_provider,
              CASE WHEN api_key_enc IS NOT NULL THEN true ELSE false END as has_api_key,
              updated_at
       FROM user_settings
       WHERE user_id = $1`,
      [req.user.id]
    )

    if (result.rows.length === 0) {
      // Create default settings if not exist
      const insert = await pool.query(
        `INSERT INTO user_settings (user_id)
         VALUES ($1)
         RETURNING ai_provider, false as has_api_key, updated_at`,
        [req.user.id]
      )
      return res.json(insert.rows[0])
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error('Get settings error:', err)
    res.status(500).json({ error: 'Failed to get settings' })
  }
})

// PUT /api/settings - Update settings
router.put('/', async (req, res) => {
  try {
    const { ai_provider, api_key } = req.body

    // Validate provider
    if (ai_provider && !['claude', 'openai'].includes(ai_provider)) {
      return res.status(400).json({ error: 'Invalid AI provider' })
    }

    // Build update query dynamically
    const updates = []
    const values = []
    let paramIndex = 1

    if (ai_provider) {
      updates.push(`ai_provider = $${paramIndex}`)
      values.push(ai_provider)
      paramIndex++
    }

    if (api_key !== undefined) {
      if (api_key === null || api_key === '') {
        // Clear the API key
        updates.push(`api_key_enc = NULL`)
      } else {
        // Encrypt and store the API key
        const encryptedKey = encrypt(api_key)
        updates.push(`api_key_enc = $${paramIndex}`)
        values.push(encryptedKey)
        paramIndex++
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' })
    }

    updates.push(`updated_at = NOW()`)
    values.push(req.user.id)

    const result = await pool.query(
      `UPDATE user_settings
       SET ${updates.join(', ')}
       WHERE user_id = $${paramIndex}
       RETURNING ai_provider,
                 CASE WHEN api_key_enc IS NOT NULL THEN true ELSE false END as has_api_key,
                 updated_at`,
      values
    )

    res.json(result.rows[0])
  } catch (err) {
    console.error('Update settings error:', err)
    res.status(500).json({ error: 'Failed to update settings' })
  }
})

// POST /api/settings/verify-key - Verify API key works
router.post('/verify-key', async (req, res) => {
  try {
    const { ai_provider, api_key } = req.body

    if (!api_key) {
      return res.status(400).json({ error: 'API key is required' })
    }

    if (ai_provider === 'claude') {
      // Test Claude API
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: api_key })

      await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })

      res.json({ valid: true, provider: 'claude' })
    } else if (ai_provider === 'openai') {
      // Test OpenAI API
      const { default: OpenAI } = await import('openai')
      const client = new OpenAI({ apiKey: api_key })

      await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })

      res.json({ valid: true, provider: 'openai' })
    } else {
      res.status(400).json({ error: 'Invalid provider' })
    }
  } catch (err) {
    console.error('Verify key error:', err)

    // Parse common error messages
    const message = err.message || 'Invalid API key'
    if (message.includes('401') || message.includes('invalid') || message.includes('Incorrect')) {
      return res.status(400).json({ error: 'Invalid API key', valid: false })
    }
    if (message.includes('insufficient_quota') || message.includes('rate')) {
      return res.status(400).json({ error: 'API key valid but rate limited or no quota', valid: false })
    }

    res.status(400).json({ error: 'Could not verify API key', valid: false })
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

const app = express()

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/settings', settingsRoutes)

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

## 2.2 Frontend Settings Page

### frontend/src/pages/SettingsPage.jsx
```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'

const providers = [
  {
    id: 'claude',
    name: 'Claude',
    company: 'Anthropic',
    description: 'Recommended for best results',
    keyPrefix: 'sk-ant-',
    keyPlaceholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'openai',
    name: 'GPT-4',
    company: 'OpenAI',
    description: 'Alternative option',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys'
  }
]

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const [selectedProvider, setSelectedProvider] = useState('claude')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const [message, setMessage] = useState({ type: '', text: '' })

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const { data } = await api.get('/settings')
      setSettings(data)
      setSelectedProvider(data.ai_provider || 'claude')
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyKey = async () => {
    if (!apiKey.trim()) {
      setMessage({ type: 'error', text: 'Please enter an API key' })
      return
    }

    setVerifying(true)
    setMessage({ type: '', text: '' })

    try {
      await api.post('/settings/verify-key', {
        ai_provider: selectedProvider,
        api_key: apiKey
      })
      setMessage({ type: 'success', text: 'API key is valid!' })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Invalid API key' })
    } finally {
      setVerifying(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage({ type: '', text: '' })

    try {
      const payload = { ai_provider: selectedProvider }

      // Only include api_key if user entered a new one
      if (apiKey.trim()) {
        payload.api_key = apiKey
      }

      const { data } = await api.put('/settings', payload)
      setSettings(data)
      setApiKey('') // Clear the input after save
      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleClearKey = async () => {
    if (!confirm('Are you sure you want to remove your API key?')) return

    setSaving(true)
    try {
      const { data } = await api.put('/settings', {
        ai_provider: selectedProvider,
        api_key: null
      })
      setSettings(data)
      setMessage({ type: 'success', text: 'API key removed' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to remove API key' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const currentProvider = providers.find(p => p.id === selectedProvider)

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Back to chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold">Settings</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Account Section */}
        <section className="card p-5">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
            Account
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="text-sm text-slate-400">{user?.email}</p>
            </div>
            <button onClick={logout} className="btn-ghost text-sm text-error-400">
              Sign Out
            </button>
          </div>
        </section>

        {/* AI Provider Section */}
        <section className="card p-5">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
            AI Provider
          </h2>

          {/* Provider Toggle */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => setSelectedProvider(provider.id)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedProvider === provider.id
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="font-medium">{provider.name}</div>
                <div className="text-xs text-slate-400">{provider.company}</div>
                {provider.id === 'claude' && (
                  <div className="mt-2 text-xs text-primary-400">Recommended</div>
                )}
              </button>
            ))}
          </div>

          {/* API Key Input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">
                {currentProvider?.name} API Key
              </label>
              {settings?.has_api_key && (
                <span className="badge-success">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Key saved
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.has_api_key ? '••••••••••••••••' : currentProvider?.keyPlaceholder}
                className="input-field pr-20"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-sm"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Get your API key from{' '}
              <a
                href={currentProvider?.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-400 hover:underline"
              >
                {currentProvider?.company}
              </a>
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleVerifyKey}
                disabled={!apiKey.trim() || verifying}
                className="btn-secondary text-sm"
              >
                {verifying ? 'Verifying...' : 'Verify Key'}
              </button>

              {settings?.has_api_key && (
                <button
                  onClick={handleClearKey}
                  disabled={saving}
                  className="btn-ghost text-sm text-error-400"
                >
                  Remove Key
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Message */}
        {message.text && (
          <div
            className={`p-4 rounded-lg border ${
              message.type === 'success'
                ? 'bg-success-500/10 border-success-500/20 text-success-400'
                : 'bg-error-500/10 border-error-500/20 text-error-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full py-3"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </main>
    </div>
  )
}
```

---

## 2.3 Update App.jsx with Settings Route

### frontend/src/App.jsx
```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
      <div className="min-h-screen flex items-center justify-center">
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
          <div className="p-8 text-center">
            <h1 className="text-2xl font-semibold">Welcome to MemoBrain</h1>
            <p className="text-slate-400 mt-2">Chat page coming in Phase 4</p>
            <a href="/settings" className="text-primary-400 hover:underline mt-4 inline-block">
              Configure AI Settings →
            </a>
          </div>
        </ProtectedRoute>
      } />
    </Routes>
  )
}
```

---

## 2.4 Verification Checklist

After Phase 2, verify:

- [ ] GET `/api/settings` returns user settings (provider + has_api_key flag)
- [ ] PUT `/api/settings` saves provider choice
- [ ] PUT `/api/settings` with `api_key` encrypts and stores key
- [ ] POST `/api/settings/verify-key` validates Claude key
- [ ] POST `/api/settings/verify-key` validates OpenAI key
- [ ] Settings page loads current settings
- [ ] Provider toggle switches between Claude/OpenAI
- [ ] API key input shows masked placeholder when key exists
- [ ] Verify button tests the key and shows result
- [ ] Save button persists changes
- [ ] Remove key button clears the stored key
- [ ] Navigation from home to settings works
- [ ] Navigation from settings back to home works

---

## Files Created/Modified in Phase 2

**New Files:**
```
backend/src/routes/settings.js
frontend/src/pages/SettingsPage.jsx
```

**Modified Files:**
```
backend/src/index.js          # Add settings routes
frontend/src/App.jsx          # Add settings route
```
