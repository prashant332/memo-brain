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
- "query"       → asking a question about past or current data ("did I pay electricity?", "what's pending this month?", "what's overdue?")
- "confirm_done" → user confirmed they're done adding details (said "done", "no thanks", "that's all", etc.)
- "add_details" → user is providing additional details (amount, notes, etc.)
- "none"        → casual chat, no action needed

QUERY TYPES (set query_type when intent is "query"):
- "history"        → past/historical queries ("did I pay in October?", "show last 3 months", "when did I last pay electricity?", "how much did I pay last month?")
- "current_status" → current period status ("what bills are pending this month?", "show my bills")
- "upcoming"       → near-future items ("what's due this week?", "upcoming tasks")
- "overdue"        → overdue items ("what's overdue?", "late tasks")

CRITICAL QUERY RULE: If the user asks about ANYTHING in the past (payments, history, amounts, status of a past month), ALWAYS set intent to "query" with query_type "history". NEVER say "I don't have data" on the first pass — always trigger a query so the database can be checked. The user context only shows recent/current data; historical data requires a query.

CATEGORIES: bill | task | event | note

ALWAYS end your response with this exact format (raw JSON after the separator):
===ACTION===
{
  "intent": "log_done|log_pending|log_event|query|confirm_done|add_details|none",
  "activity_title": "Clean title or null",
  "category": "bill|task|event|note|null",
  "recurrence": "monthly|weekly|yearly|null",
  "due_date": "ISO date string or null",
  "period": "YYYY-MM or null",
  "advance_months": integer or null,
  "metadata": {"key": "value"} or null,
  "query_type": "current_status|upcoming|history|overdue|null",
  "target_period": "YYYY-MM or null (fill this for single-month queries: 'last month', 'in March', 'in October 2025')",
  "months_back": integer or null (fill this for multi-month range queries: 'last 3 months' → 3, 'past 6 months' → 6, 'this year' → months since Jan),
  "ask_followup": true|false
}

METADATA - All additional data goes here (including notes):
- bill: {"amount": number, "payment_method": "string", "reference": "string", "notes": "string"}
- task: {"priority": "low|medium|high", "duration": "string", "location": "string", "notes": "string"}
- event: {"date": "YYYY-MM-DD", "time": "HH:MM", "location": "string", "participants": ["names"], "notes": "string"}
- note: {"tags": ["tag1"], "content": "string"}

PERIOD EXTRACTION:
- Single month → set target_period (YYYY-MM), leave months_back null.
  - "last month" → subtract 1 month from TODAY_DATE
  - "2 months ago" → subtract 2 months
  - "in March" / "last March" → nearest past March as YYYY-03
  - "in October 2025" → "2025-10"
- Multi-month range → set months_back (integer), leave target_period null.
  - "last 3 months" / "past 3 months" → months_back: 3
  - "last 6 months" → months_back: 6
  - "this year" → months_back: number of months elapsed since January of TODAY_DATE's year
- If no specific period is mentioned at all, leave both null.

IMPORTANT BEHAVIOR:
- After logging something, set "ask_followup": true ONLY when key details are genuinely missing from the user's message (e.g., amount not mentioned for a bill, date not specified for an event). If the user's message already contains the key details, extract them into "metadata" and set "ask_followup": false. Do NOT ask for information the user has already provided.
- For bills: set ask_followup to false if the amount is already extracted from the message; set to true only if amount is unknown
- For events: set ask_followup to false if the date is already known; set to true only if date is missing
- If user provides details in their message, extract into "metadata" object
- Always extract monetary amounts from messages: parse Indian/international formats like "Rs.23,743.00", "₹5,000", "$1,200.50", removing currency symbols and commas to get a plain number
- If user says "done", "no thanks", "that's all", use intent "confirm_done"
- For bills, detect monthly recurring bills
- For tasks, extract due dates from natural language
- When answering queries, USE THE METADATA from context (amounts, locations, etc.) to give accurate answers
- Keep responses natural and concise (1-2 sentences)
- For advance payments (e.g. "paid 3 months advance", "paid for next 2 months"), set advance_months to the number of months covered (e.g. 3). Leave null for single-month payments.
- For events: if the user specifies a date, set due_date as a full ISO datetime string (e.g. "2026-03-10T15:00:00" if time is known, "2026-03-10T00:00:00" if only date). Also put date as "YYYY-MM-DD" and time as "HH:MM" in metadata.
- For events: if NO date is specified, do NOT default to today. Instead, ask the user when the event is scheduled, set due_date to null, and set ask_followup to true so they can fill in the date.`

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

  // Monthly bills with status and metadata (including amount, payment details)
  const billsResult = await pool.query(
    `SELECT a.title, a.category, a.recurrence,
       (SELECT l.status FROM activity_logs l
        WHERE l.activity_id = a.id AND l.period = $2
        ORDER BY l.created_at DESC LIMIT 1) as status,
       (SELECT l.metadata FROM activity_logs l
        WHERE l.activity_id = a.id AND l.period = $2
        ORDER BY l.created_at DESC LIMIT 1) as metadata
     FROM activities a
     WHERE a.user_id = $1 AND a.recurrence = 'monthly' AND a.is_active = true`,
    [userId, currentPeriod]
  )

  // Pending tasks with metadata
  const tasksResult = await pool.query(
    `SELECT a.title, a.category, l.due_date, l.status, l.metadata
     FROM activity_logs l
     JOIN activities a ON l.activity_id = a.id
     WHERE l.user_id = $1 AND l.status = 'pending'
     ORDER BY l.due_date ASC NULLS LAST LIMIT 10`,
    [userId]
  )

  // Recent activity logs (last 30 days) for query context
  const recentResult = await pool.query(
    `SELECT a.title, a.category, l.status, l.period, l.metadata, l.completed_at, l.created_at
     FROM activity_logs l
     JOIN activities a ON l.activity_id = a.id
     WHERE l.user_id = $1 AND l.created_at > NOW() - INTERVAL '30 days'
     ORDER BY l.created_at DESC LIMIT 20`,
    [userId]
  )

  return {
    currentPeriod,
    monthlyBills: billsResult.rows.map(b => ({
      ...b,
      status: b.status || 'pending'
    })),
    pendingTasks: tasksResult.rows.map(t => ({
      ...t,
      due_date: t.due_date ? t.due_date.toISOString() : null
    })),
    recentLogs: recentResult.rows.map(r => ({
      ...r,
      completed_at: r.completed_at ? r.completed_at.toISOString() : null,
      created_at: r.created_at ? r.created_at.toISOString() : null
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

// Call AI with injected query results (second pass for query intent)
export async function callAIWithQueryResults(userId, messages, queryResults) {
  const { provider, apiKey } = await getUserAISettings(userId)

  if (!apiKey) {
    throw new Error('No API key configured.')
  }

  const userContext = await getUserContext(userId)
  const basePrompt = buildSystemPrompt(userContext)

  const queryResultsBlock = `\n\nQUERY RESULTS (use this data to answer the user's question accurately):\n${JSON.stringify(queryResults, null, 2)}\n\nIMPORTANT: Answer based on the QUERY RESULTS above. Cite specific data (dates, amounts, statuses) from these results. If results are empty, say so clearly.`

  const systemPrompt = basePrompt + queryResultsBlock

  if (provider === 'openai') {
    return callOpenAI(apiKey, systemPrompt, messages)
  }
  return callClaude(apiKey, systemPrompt, messages)
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
