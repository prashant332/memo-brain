# MemoBrain — Build Specification & Developer README

> A chat-first personal memory assistant. Users log bills, tasks, and events by talking naturally. Claude AI interprets the message, stores structured data in Postgres, and answers queries from that data.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Backend Specification](#5-backend-specification)
6. [Frontend Specification](#6-frontend-specification)
7. [Claude AI Integration](#7-claude-ai-integration)
8. [Auth Flow](#8-auth-flow)
9. [API Reference](#9-api-reference)
10. [Setup & Run](#10-setup--run)
11. [PWA / Android](#11-pwa--android)
12. [Phase 2 Roadmap](#12-phase-2-roadmap)

---

## 1. Product Overview

### What It Does

MemoBrain is a **chat-first activity tracker**. Instead of filling forms, users type naturally:

- `"Paid electricity bill today"` → logs bill as done for current month
- `"Remind me to visit bank on Friday"` → schedules a pending task with due date
- `"Did I pay water bill this month?"` → queries DB and answers with real data
- `"What's pending this week?"` → summarizes open tasks

### Core Concepts

| Concept | Description |
|---|---|
| **Activity** | A template — e.g. "Electricity Bill" (monthly recurring) or "Visit Bank" (one-off) |
| **Activity Log** | A timestamped instance — e.g. Electricity Bill paid on 2026-02-15 |
| **Session** | A chat conversation. All sessions stored as history |
| **Period** | The billing/tracking period, formatted `YYYY-MM` for monthly items |

### User Flow

```
Open app
  → See Dashboard Strip (bill statuses + overdue + upcoming)
  → Chat input front and center
  → Type anything → Claude logs or answers
  → Sidebar shows past chat sessions
  → Click a session → scroll full history
```

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite | Fast dev server, PWA support |
| Styling | Tailwind CSS v3 | Utility-first, dark theme |
| HTTP Client | Axios | Auto-attaches JWT, handles 401 |
| Routing | React Router v6 | `/` = chat, `/login` = auth |
| Backend | Node.js + Express | ES Modules (`"type": "module"`) |
| Database | PostgreSQL 14+ | Local, no cloud |
| AI | Anthropic Claude API | `claude-sonnet-4-6` model |
| Auth | JWT (jsonwebtoken) + bcryptjs | 30-day tokens, stored in localStorage |
| Dev runner | concurrently | Runs frontend + backend together |

### Key npm packages

**Backend:**
```
@anthropic-ai/sdk   bcryptjs   cors   dotenv   express   jsonwebtoken   pg   nodemon
```

**Frontend:**
```
react   react-dom   react-router-dom   axios   date-fns
vite   @vitejs/plugin-react   tailwindcss   autoprefixer   postcss
```

---

## 3. Project Structure

```
memobrain/
├── package.json                  ← root: runs both with concurrently
├── database/
│   └── schema.sql                ← full Postgres schema, run once
├── backend/
│   ├── package.json              ← "type": "module", nodemon dev script
│   ├── .env                      ← DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY
│   └── src/
│       ├── index.js              ← Express app, mounts all routes, CORS
│       ├── db/
│       │   └── pool.js           ← pg.Pool from DATABASE_URL env var
│       ├── middleware/
│       │   └── auth.js           ← JWT verify middleware, sets req.user
│       └── routes/
│           ├── auth.js           ← POST /api/auth/register, /api/auth/login
│           ├── activities.js     ← GET/POST activities, POST log, PATCH log, GET dashboard
│           └── chat.js           ← GET/POST sessions, GET messages, POST message (Claude)
└── frontend/
    ├── package.json
    ├── vite.config.js            ← proxy /api → localhost:3001
    ├── tailwind.config.js        ← custom fonts: Playfair Display, DM Sans
    ├── postcss.config.js
    ├── index.html                ← loads Google Fonts, links manifest.json
    ├── public/
    │   └── manifest.json         ← PWA manifest
    └── src/
        ├── main.jsx              ← ReactDOM.createRoot, BrowserRouter, AuthProvider
        ├── index.css             ← Tailwind directives + custom component classes
        ├── lib/
        │   └── api.js            ← Axios instance with JWT interceptor + 401 redirect
        ├── hooks/
        │   └── useAuth.jsx       ← AuthContext: user state, login(), register(), logout()
        ├── pages/
        │   ├── LoginPage.jsx     ← Login/Register toggle form
        │   └── ChatPage.jsx      ← Main layout: sidebar + dashboard strip + chat
        └── components/
            ├── SessionSidebar.jsx   ← Session list, new chat button, logout
            ├── DashboardStrip.jsx   ← Bills status row + upcoming + overdue pills
            └── MessageBubble.jsx    ← Chat bubble with action pill metadata
```

---

## 4. Database Schema

Run this once to set up:
```bash
psql -U postgres -c "CREATE DATABASE memobrain;"
psql -U postgres -d memobrain -f database/schema.sql
```

### schema.sql

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (Supabase Auth not used — self-managed JWT)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Activity templates: the "what" that gets tracked
-- e.g. "Electricity Bill" (monthly), "Visit Bank" (one-off)
CREATE TABLE activities (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(500) NOT NULL,
  category       VARCHAR(50) NOT NULL DEFAULT 'task',  -- bill | task | event | note
  recurrence     VARCHAR(20) DEFAULT NULL,              -- null | daily | weekly | monthly | yearly
  recurrence_day INTEGER DEFAULT NULL,                  -- day of month (1–31) for monthly bills
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log entries: each time something is done, planned, or tracked
CREATE TABLE activity_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id  UUID REFERENCES activities(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'done',   -- done | pending | skipped
  period       VARCHAR(20) DEFAULT NULL,               -- 'YYYY-MM' for monthly; ISO date for one-offs
  notes        TEXT DEFAULT NULL,
  due_date     TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,               -- set when status = 'done'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Chat sessions (each conversation is a session)
CREATE TABLE chat_sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) DEFAULT 'New Session',       -- auto-set from first message
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at   TIMESTAMPTZ DEFAULT NULL
);

-- Individual messages within a session
CREATE TABLE chat_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL,    -- user | assistant
  content    TEXT NOT NULL,           -- the visible message text (assistant: stripped of ACTION block)
  metadata   JSONB DEFAULT '{}',      -- { action: {intent, ...}, actionResult: {activity_id, log} }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brain sharing between users (Phase 2 — create table now, implement later)
CREATE TABLE brain_shares (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission          VARCHAR(20) DEFAULT 'read',   -- read | write
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_user_id, shared_with_user_id)
);

-- Indexes
CREATE INDEX idx_activities_user      ON activities(user_id);
CREATE INDEX idx_activity_logs_user   ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_act    ON activity_logs(activity_id);
CREATE INDEX idx_activity_logs_period ON activity_logs(period);
CREATE INDEX idx_chat_messages_sess   ON chat_messages(session_id);
CREATE INDEX idx_chat_sessions_user   ON chat_sessions(user_id);
```

---

## 5. Backend Specification

### Entry Point — `src/index.js`

```js
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

app.use('/api/auth',       authRoutes)
app.use('/api/activities', activitiesRoutes)   // all protected by authMiddleware
app.use('/api/chat',       chatRoutes)         // all protected by authMiddleware

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
app.listen(process.env.PORT || 3001)
```

### Auth Middleware — `src/middleware/auth.js`

- Reads `Authorization: Bearer <token>` header
- Verifies JWT with `JWT_SECRET`
- Sets `req.user = { id, email, name }`
- Returns 401 if missing, 403 if invalid/expired

### Route: `src/routes/auth.js`

**POST /api/auth/register**
- Body: `{ email, password, name }`
- Checks for existing email → 409 if exists
- Hashes password with bcrypt (rounds: 10)
- Inserts user
- Returns `{ token, user: { id, email, name } }`

**POST /api/auth/login**
- Body: `{ email, password }`
- Fetches user by email
- Compares password hash
- Returns `{ token, user: { id, email, name } }`
- JWT expires in 30 days

### Route: `src/routes/activities.js`

All routes require `authMiddleware`. All queries filter by `req.user.id`.

**GET /api/activities**
Returns all active activities for the user with current-period log status joined.

**GET /api/activities/dashboard**
Returns three arrays used by DashboardStrip:
- `bills` — monthly recurring activities with `status` (`done` | `pending`) for current `YYYY-MM` period
- `upcoming` — pending logs with `due_date` in next 7 days
- `overdue` — pending logs with `due_date` in the past

Current period computed as: `to_char(NOW(), 'YYYY-MM')`

**POST /api/activities**
- Body: `{ title, category, recurrence, recurrence_day }`
- Creates an activity template
- Returns created row

**POST /api/activities/log**
- Body: `{ activity_id, status, notes, due_date, period }`
- Creates a log entry
- If `status = 'done'`, sets `completed_at = NOW()`
- `period` defaults to current `YYYY-MM` if not provided

**PATCH /api/activities/log/:logId**
- Body: `{ status?, notes? }`
- Updates a log entry owned by the user
- Sets `completed_at = NOW()` when status changes to `done`

### Route: `src/routes/chat.js`

All routes require `authMiddleware`.

**GET /api/chat/sessions**
Returns last 50 sessions for user, ordered newest first. Joins first user message as `first_message` for display.

**POST /api/chat/sessions**
Creates a new session with default title `'New Session'`. Returns session row.

**GET /api/chat/sessions/:sessionId/messages**
Returns all messages for a session ordered by `created_at ASC`. Verifies session belongs to user.

**POST /api/chat/sessions/:sessionId/message** ← The core endpoint
See full spec in Section 7.

---

## 6. Frontend Specification

### `src/lib/api.js`

Axios instance with `baseURL: '/api'` (Vite proxies to `localhost:3001`).

Interceptors:
- **Request**: Reads `memobrain_token` from localStorage, adds `Authorization: Bearer` header
- **Response error**: On 401, clears localStorage and redirects to `/login`

### `src/hooks/useAuth.jsx`

React context providing:
- `user` — parsed from `memobrain_user` localStorage on init
- `login(email, password)` — calls `/api/auth/login`, stores token + user
- `register(email, password, name)` — calls `/api/auth/register`, stores token + user
- `logout()` — clears localStorage, sets user to null

Wrap app in `<AuthProvider>`. Use `useAuth()` hook anywhere.

### `src/pages/LoginPage.jsx`

Two-mode form (toggle between Sign In / Register) with:
- Tab switcher (sign in / register)
- Conditional name field for register mode
- Error display from API response
- Loading spinner on submit
- On success: navigate to `/`

### `src/pages/ChatPage.jsx`

Main layout: sidebar (collapsible) + right panel.

Right panel top-to-bottom:
1. **Header bar** — sidebar toggle button, title, subtitle
2. **DashboardStrip** — live status bar (re-fetches after any log action)
3. **Messages area** — scrollable, auto-scrolls to bottom on new message
4. **Input area** — auto-resizing textarea, send button, keyboard hint

**Empty state**: Show 5 clickable suggestion chips when no messages in session.

**Sending a message:**
1. Trim input, return if empty or already sending
2. Ensure session exists (create one if `sessionId` is null)
3. Add optimistic user message to state immediately
4. POST to `/api/chat/sessions/:id/message`
5. On success: replace optimistic message + append assistant message
6. If `action.intent` is not `none`/`query`: call `window.__reloadDashboard()` and `window.__reloadSessions()`
7. On error: remove optimistic message

**Keyboard**: Enter sends, Shift+Enter newline.

**Typing indicator**: Show animated dots while `sending === true`.

### `src/components/SessionSidebar.jsx`

- Loads sessions from `/api/chat/sessions` on mount and when `currentSessionId` changes
- Exposes `window.__reloadSessions` for ChatPage to call after new messages
- **New Chat button**: calls `onNewSession` prop
- Session list: truncated title + relative time ("2 hours ago")
- Highlights active session in amber
- Footer: user name, email, logout button (↩ icon)

### `src/components/DashboardStrip.jsx`

- Loads from `/api/activities/dashboard` on mount
- Exposes `window.__reloadDashboard` for ChatPage to trigger refresh
- Three rows (only shown if data exists):
  1. **Overdue** — rust/red color, shows due date
  2. **Bills** — colored dot (sage=done, rust=pending) + status badge
  3. **This week** — task name + day abbreviation in amber
- Horizontal scroll for overflow
- Loading skeleton while fetching

### `src/components/MessageBubble.jsx`

- User messages: right-aligned, amber-tinted bubble
- Assistant messages: left-aligned, glass-light bubble
- Below assistant messages (when action exists and intent ≠ `none`):
  - Intent label (e.g. "Logged ✓" in sage, "Scheduled" in amber)
  - Activity title in muted text
  - Category badge (color-coded pill)
- Timestamp below bubble in muted text

### Design System (Tailwind)

**Color palette** (defined in `tailwind.config.js`):
- `ink-950` background, `ink-800/900` surfaces, `ink-300/400` text
- `amber-500` primary action, `sage-400/500` success/done, `rust-400/500` error/overdue

**Component classes** (defined in `src/index.css` under `@layer components`):
- `.glass` — dark semi-transparent + backdrop blur + subtle border
- `.glass-light` — slightly lighter variant for message bubbles and cards
- `.btn-primary` — amber background, ink-950 text, hover/active states
- `.btn-ghost` — muted text, hover background
- `.badge-done` / `.badge-pending` — colored status pills
- `.badge-bill` / `.badge-task` / `.badge-event` — category pills
- `.input-field` — dark input with amber focus ring

**Fonts** (loaded from Google Fonts in `index.html`):
- `Playfair Display` — display/logo use
- `DM Sans` — body text
- `JetBrains Mono` — timestamps, codes

**Animations** (defined as Tailwind utilities):
- `.animate-fade-in` — opacity 0→1, 0.3s
- `.animate-slide-up` — translateY(12px)→0 + fade, 0.35s cubic-bezier

---

## 7. Claude AI Integration

This is the heart of the app. Lives in `src/routes/chat.js`.

### The Dual-Output Pattern

Every Claude response contains two parts separated by `===ACTION===`:

```
Part 1: Natural language reply (shown to user)
===ACTION===
{ JSON action object (parsed by backend, never shown to user) }
```

### System Prompt

Build dynamically per request. Inject:
- Today's date (ISO)
- Current month name + year
- User context object (see below)

```
You are MemoBrain, a personal memory assistant. You help users log daily activities,
track bills and tasks, and answer questions about what they've done or need to do.

TODAY'S DATE: [ISO date]
CURRENT MONTH: [Month Year]

CURRENT USER CONTEXT:
[JSON: { currentPeriod, monthlyBills: [{title, status}], pendingTasks: [{title, due_date}] }]

YOUR JOB:
1. Understand what the user is saying naturally
2. Respond in a friendly, concise way (1–3 sentences)
3. ALWAYS end your response with a JSON block

INTENT TYPES:
- "log_done"    → user completed something ("paid bill", "visited bank")
- "log_pending" → user plans to do something ("going to bank tomorrow")
- "log_event"   → future event ("birthday on March 5")
- "query"       → asking a question ("did I pay electricity?")
- "none"        → casual chat, no action needed

CATEGORIES: bill | task | event | note

ALWAYS end with this exact format (raw JSON after ===ACTION===):
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
```

### User Context Query

Before each Claude call, fetch:
```sql
-- Monthly bills with current period status
SELECT a.title, a.category, a.recurrence,
  COALESCE(
    (SELECT l.status FROM activity_logs l
     WHERE l.activity_id = a.id AND l.period = $currentPeriod
     ORDER BY l.created_at DESC LIMIT 1),
    'pending'
  ) as status
FROM activities a
WHERE a.user_id = $userId AND a.recurrence = 'monthly' AND a.is_active = true

-- Pending tasks (no period filter)
SELECT a.title, a.category, l.due_date, l.status, l.notes
FROM activity_logs l
JOIN activities a ON l.activity_id = a.id
WHERE l.user_id = $userId AND l.status = 'pending'
ORDER BY l.due_date ASC NULLS LAST LIMIT 10
```

### Conversation History

Pass last 10 messages of the session as the `messages` array to Claude. This gives Claude context across the session.

### POST /api/chat/sessions/:sessionId/message — Full Flow

```
1. Validate session belongs to user
2. Save user message to chat_messages
3. Fetch last 10 messages from session (for history context)
4. Fetch user context (bills + pending tasks)
5. Build system prompt with context injected
6. Call Claude API:
   model: 'claude-sonnet-4-6'
   max_tokens: 1024
   system: [built system prompt]
   messages: [...history, { role: 'user', content: userMessage }]
7. Parse response → split on '===ACTION==='
   - Part 0 = message (string)
   - Part 1 = JSON.parse() → action object
8. Execute action (if intent is not 'none' or 'query'):
   a. Find activity by LOWER(title) match for this user
   b. If not found → INSERT new activity with title/category/recurrence
   c. INSERT activity_log with status/notes/due_date/period
9. Update session title:
   UPDATE chat_sessions SET title = first 60 chars of message
   WHERE title = 'New Session'  (only update if still default)
10. Save assistant message with metadata = { action, actionResult }
11. Return { message, action, actionResult }
```

### Parsing Claude Response

```js
function parseClaudeResponse(rawContent) {
  const parts = rawContent.split('===ACTION===')
  const message = parts[0].trim()
  let action = null
  if (parts[1]) {
    try { action = JSON.parse(parts[1].trim()) }
    catch (e) { console.warn('Failed to parse action JSON') }
  }
  return { message, action }
}
```

### Activity Find-or-Create Logic

```js
// Case-insensitive title match scoped to user
const existing = await pool.query(
  `SELECT id FROM activities
   WHERE user_id = $1 AND LOWER(title) = LOWER($2) LIMIT 1`,
  [userId, activity_title]
)

if (existing.rows.length > 0) {
  activityId = existing.rows[0].id
} else {
  // Create new activity template
  const result = await pool.query(
    `INSERT INTO activities (user_id, title, category, recurrence)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, activity_title, category || 'task', recurrence || null]
  )
  activityId = result.rows[0].id
}
```

---

## 8. Auth Flow

```
Register/Login
  → POST /api/auth/register or /login
  → Server returns { token (JWT, 30d), user: { id, email, name } }
  → Frontend stores in localStorage:
      memobrain_token = JWT string
      memobrain_user  = JSON.stringify(user)

Every API request
  → Axios interceptor reads memobrain_token
  → Adds header: Authorization: Bearer <token>

Token expiry / invalid
  → API returns 401
  → Axios response interceptor clears localStorage
  → Redirects to /login

Logout
  → Clear both localStorage keys
  → Set user state to null
  → React Router redirects to /login
```

### Route Protection (React Router)

```jsx
<Routes>
  <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
  <Route path="/"      element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
</Routes>

// ProtectedRoute: if no user → Navigate to /login
// PublicRoute: if user → Navigate to /
```

---

## 9. API Reference

All endpoints except auth require `Authorization: Bearer <token>` header.

### Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | /api/auth/register | `{ email, password, name }` | `{ token, user }` |
| POST | /api/auth/login | `{ email, password }` | `{ token, user }` |

### Activities

| Method | Path | Body/Params | Returns |
|---|---|---|---|
| GET | /api/activities | — | Array of activities with current-period log |
| GET | /api/activities/dashboard | — | `{ currentPeriod, bills[], upcoming[], overdue[] }` |
| POST | /api/activities | `{ title, category, recurrence?, recurrence_day? }` | Created activity |
| POST | /api/activities/log | `{ activity_id, status?, notes?, due_date?, period? }` | Created log |
| PATCH | /api/activities/log/:logId | `{ status?, notes? }` | Updated log |

### Chat

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/chat/sessions | — | Array of sessions (last 50) |
| POST | /api/chat/sessions | — | Created session |
| GET | /api/chat/sessions/:id/messages | — | Array of messages |
| POST | /api/chat/sessions/:id/message | `{ content }` | `{ message, action, actionResult }` |

### System

| Method | Path | Returns |
|---|---|---|
| GET | /api/health | `{ status: 'ok', timestamp }` |

---

## 10. Setup & Run

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally
- Anthropic API key from [console.anthropic.com](https://console.anthropic.com)

### Step 1 — Initialize project

```bash
mkdir memobrain && cd memobrain
git init

# Root package.json — runs both services with concurrently
npm init -y
npm install -D concurrently
```

Add to root `package.json` scripts:
```json
{
  "scripts": {
    "dev": "concurrently \"cd backend && npm run dev\" \"cd frontend && npm run dev\""
  }
}
```

### Step 2 — Backend setup

```bash
mkdir -p backend/src/{routes,middleware,db}
cd backend
npm init -y
# Set "type": "module" in package.json
npm install @anthropic-ai/sdk bcryptjs cors dotenv express jsonwebtoken pg
npm install -D nodemon
```

Add to `backend/package.json`:
```json
{
  "type": "module",
  "scripts": {
    "dev": "nodemon src/index.js",
    "start": "node src/index.js"
  }
}
```

Create `backend/.env`:
```
PORT=3001
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/memobrain
JWT_SECRET=replace-with-long-random-string
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### Step 3 — Database setup

```bash
psql -U postgres
CREATE DATABASE memobrain;
\q

# Run schema (create schema.sql from Section 4 first)
psql -U postgres -d memobrain -f database/schema.sql
```

### Step 4 — Frontend setup

```bash
cd ..
npm create vite@latest frontend -- --template react
cd frontend
npm install axios date-fns react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Update `tailwind.config.js` content paths:
```js
content: ['./index.html', './src/**/*.{js,jsx}']
```

Update `vite.config.js` to add proxy:
```js
server: {
  port: 5173,
  proxy: { '/api': 'http://localhost:3001' }
}
```

Add to `index.html` `<head>`:
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="manifest" href="/manifest.json" />
```

Add `frontend/public/manifest.json`:
```json
{
  "name": "MemoBrain",
  "short_name": "MemoBrain",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0e0c0a",
  "theme_color": "#f59e0b"
}
```

### Step 5 — Run everything

```bash
# From project root
npm run dev
```

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

Open `http://localhost:5173` → Register → Start chatting.

### Verify it works

1. Register with any email/password
2. Type: `"Paid electricity bill today"` → should see "Logged ✓" pill
3. Type: `"Remind me to visit bank on Friday"` → should see "Scheduled" pill
4. Type: `"Did I pay electricity this month?"` → Claude answers from DB context
5. Dashboard strip should show Electricity Bill as ✓ done
6. Create a new session → old one should appear in sidebar

---

## 11. PWA / Android

The app is already PWA-ready with `manifest.json` in place.

### Install on Android

1. Make sure backend is accessible on your local network (change `vite.config.js`):
   ```js
   server: { host: '0.0.0.0', port: 5173, proxy: { '/api': 'http://YOUR_LOCAL_IP:3001' } }
   ```
2. Also update backend CORS origin to allow your LAN IP
3. Open `http://YOUR_LOCAL_IP:5173` in Chrome on Android
4. Tap menu (⋮) → **Add to Home Screen**
5. App icon appears on home screen, opens fullscreen like native

### Tailscale for remote access (optional)

If you want access outside your home network:
1. Install [Tailscale](https://tailscale.com) on the server machine
2. Access via Tailscale IP — no port forwarding needed

---

## 12. Phase 2 Roadmap

These are not in the MVP but the schema and architecture already supports them:

### Recurring task auto-reset
- Cron job (node-cron) runs nightly
- For each user's monthly activities, if no log exists for current `YYYY-MM`, ensure `pending` status is implied
- No DB writes needed — dashboard query already defaults to `pending` if no log found for period

### Push notifications (Web Push API)
- Service worker registers push subscription
- Backend stores subscription in new `push_subscriptions` table
- Nightly job sends push for overdue items using `web-push` npm package

### "Share my brain" — family access
- `brain_shares` table already in schema
- New settings page: enter family member email, set `read` or `write` permission
- Activity/log queries JOIN brain_shares to include shared users' data
- Chat route checks if user is viewing someone else's brain and scopes queries accordingly

### Yearly events (birthdays, renewals)
- Already supported by `recurrence = 'yearly'`
- Dashboard needs a new row: "This year" for yearly recurring items
- Claude system prompt needs example for yearly recurrence

### Export history
- GET /api/export → streams CSV of all activity logs
- Use `json2csv` npm package

### Multi-device sync
- Already works if both devices connect to the same backend
- No extra work needed beyond network accessibility (see PWA section)

---

## Notes for Claude Code

When implementing with Claude Code, work in this order for fastest results:

1. `database/schema.sql` — create and run first, verify with `\dt` in psql
2. `backend/src/db/pool.js` + `backend/src/middleware/auth.js` — no logic, just boilerplate
3. `backend/src/routes/auth.js` — test with curl before moving on
4. `backend/src/routes/activities.js` — test dashboard endpoint with a seeded user
5. `backend/src/routes/chat.js` — most complex; build `getUserContext` and `executeAction` as standalone functions first, then wire into the route
6. Frontend scaffolding — Vite + Tailwind + Google Fonts first, verify blank page loads
7. `src/lib/api.js` + `src/hooks/useAuth.jsx` — foundational, needed by all pages
8. `src/pages/LoginPage.jsx` — get auth working end-to-end before building chat
9. `src/components/DashboardStrip.jsx` — standalone, easy to test
10. `src/components/MessageBubble.jsx` — pure display component, no logic
11. `src/components/SessionSidebar.jsx` — straightforward list component
12. `src/pages/ChatPage.jsx` — wire everything together last

**Key things to get right:**
- The `===ACTION===` split in chat.js is load-bearing — Claude must always output this separator
- The `find-or-create` activity logic must be case-insensitive to avoid duplicate "electricity bill" and "Electricity Bill" entries
- Dashboard strip uses `window.__reloadDashboard` as a global — ChatPage sets this, DashboardStrip reads it
- The Axios 401 interceptor must redirect to `/login` otherwise users get stuck on expired tokens
- Vite proxy (`/api` → port 3001) means you never hardcode localhost URLs in frontend code