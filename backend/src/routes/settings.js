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

// GET /api/settings/reveal-key - Return decrypted key (explicit user request)
router.get('/reveal-key', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT api_key_enc FROM user_settings WHERE user_id = $1',
      [req.user.id]
    )

    if (result.rows.length === 0 || !result.rows[0].api_key_enc) {
      return res.status(404).json({ error: 'No API key saved' })
    }

    const apiKey = decrypt(result.rows[0].api_key_enc)
    res.json({ api_key: apiKey })
  } catch (err) {
    console.error('Reveal key error:', err)
    res.status(500).json({ error: 'Failed to retrieve API key' })
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
