# MemoBrain — Design & Technical Reference

> This document covers architecture, database schema, backend/frontend specifications, AI integration, API reference, and developer notes.
> For a non-technical overview and setup guide, see [README.MD](./README.MD).

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Project Structure](#2-project-structure)
3. [Database Schema](#3-database-schema)
4. [Backend Specification](#4-backend-specification)
5. [Frontend Specification](#5-frontend-specification)
6. [Claude AI Integration](#6-claude-ai-integration)
7. [Auth Flow](#7-auth-flow)
8. [API Reference](#8-api-reference)
9. [Developer Setup](#9-developer-setup)
10. [PWA / Android](#10-pwa--android)
11. [Roadmap](#11-roadmap)
12. [Notes for Claude Code](#12-notes-for-claude-code)

---

## 1. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite | Fast dev server, PWA support |
| Styling | Tailwind CSS v3 | Utility-first, dark theme |
| HTTP Client | Axios | Auto-attaches JWT, handles 401 |
| Routing | React Router v6 | `/` = chat, `/login` = auth |
| Backend | Node.js + Express | ES Modules (`"type": "module"`) |
| Database | PostgreSQL 14+ | Local, no cloud |
| AI | Anthropic Claude API / OpenAI | `claude-sonnet-4-6` or `gpt-4o` |
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

## 2. Project Structure

```
memobrain/
├── package.json                  ← root: runs both with concurrently
├── database/
│   └── init/
│       └── 01_schema.sql         ← full Postgres schema, run once
├── backend/
│   ├── package.json              ← "type": "module", nodemon dev script
│   ├── .env                      ← DATABASE_URL, JWT_SECRET
│   └── src/
│       ├── index.js              ← Express app, mounts all routes, CORS
│       ├── db/
│       │   └── pool.js           ← pg.Pool from DATABASE_URL env var
│       ├── middleware/
│       │   └── auth.js           ← JWT verify middleware, sets req.user
│       ├── utils/
│       │   └── encryption.js     ← AES encryption for stored API keys
│       └── routes/
│           ├── auth.js           ← POST /api/auth/register, /api/auth/login
│           ├── activities.js     ← GET/POST activities, POST log, PATCH log, GET dashboard
│           ├── chat.js           ← GET/POST sessions, GET messages, POST message (AI)
│           └── settings.js       ← GET/PATCH user AI provider + encrypted API key
└── frontend/
    ├── package.json
    ├── vite.config.js            ← proxy /api → localhost:3001
    ├── tailwind.config.js        ← custom color palette + fonts
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
        │   ├── useAuth.jsx       ← AuthContext: user state, login(), register(), logout()
        │   ├── useVoiceInput.js  ← Web Speech API hook for voice-to-text
        │   └── useNotifications.jsx ← Polling hook for overdue/upcoming notifications
        ├── pages/
        │   ├── LoginPage.jsx     ← Login/Register toggle form
        │   ├── ChatPage.jsx      ← Main layout: sidebar + dashboard strip + chat
        │   ├── ActivitiesPage.jsx ← Two-panel activity list + detail view (mobile-responsive)
        │   └── SettingsPage.jsx  ← AI provider selection + API key management
        └── components/
            ├── SessionSidebar.jsx   ← Session list, new chat button, logout
            ├── DashboardStrip.jsx   ← Bills status row + upcoming + overdue pills
            ├── MessageBubble.jsx    ← Chat bubble with action pill + inline MetadataForm trigger
            ├── MetadataForm.jsx     ← Inline form for collecting additional log details
            ├── ActivityCard.jsx     ← Single activity row in the list panel
            └── CategoryBadge.jsx    ← Colour-coded category pill (bill/task/event/note)
```

---

## 3. Database Schema

Run once to initialise:
```bash
psql -U postgres -c "CREATE DATABASE memobrain;"
psql -U postgres -d memobrain -f database/init/01_schema.sql
```

### schema.sql

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user AI settings (provider + encrypted API key)
CREATE TABLE user_settings (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ai_provider   VARCHAR(20) DEFAULT 'claude',  -- claude | openai
  api_key_enc   TEXT DEFAULT NULL,             -- AES-encrypted key
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Activity templates
CREATE TABLE activities (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(500) NOT NULL,
  category       VARCHAR(50) NOT NULL DEFAULT 'task',   -- bill | task | event | note
  recurrence     VARCHAR(20) DEFAULT NULL,               -- null | weekly | monthly | yearly
  recurrence_day INTEGER DEFAULT NULL,                   -- day of month (1–31) for monthly bills
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log entries
CREATE TABLE activity_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id  UUID REFERENCES activities(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'done',    -- done | pending | skipped
  period       VARCHAR(20) DEFAULT NULL,                -- 'YYYY-MM' for monthly; ISO date for one-offs
  notes        TEXT DEFAULT NULL,
  due_date     TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  metadata     JSONB DEFAULT '{}',                      -- amount, payment_method, reference, etc.
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Chat sessions
CREATE TABLE chat_sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) DEFAULT 'New Session',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at   TIMESTAMPTZ DEFAULT NULL
);

-- Chat messages
CREATE TABLE chat_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL,     -- user | assistant
  content    TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}',       -- { action, actionResult }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brain sharing (Phase 3)
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

## 4. Backend Specification

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
app.use('/api/settings',   settingsRoutes)     // all protected by authMiddleware

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
- Inserts user + creates default `user_settings` row
- Returns `{ token, user: { id, email, name } }`

**POST /api/auth/login**
- Body: `{ email, password }`
- Fetches user by email, compares password hash
- Returns `{ token, user: { id, email, name } }`
- JWT expires in 30 days

### Route: `src/routes/activities.js`

All routes require `authMiddleware`. All queries filter by `req.user.id`.

**GET /api/activities**
Returns all activities for the user with current-period log status joined.

**GET /api/activities/dashboard**
Returns three arrays used by DashboardStrip:
- `bills` — monthly recurring activities with `status` for current `YYYY-MM`
- `upcoming` — pending logs with `due_date` in next 7 days
- `overdue` — pending logs with `due_date` in the past

**GET /api/activities/:id/logs**
Paginated log history for an activity. Query params: `offset` (default 0), `limit` (default 20).

**POST /api/activities**
- Body: `{ title, category, recurrence, recurrence_day }`
- Creates an activity template

**POST /api/activities/log**
- Body: `{ activity_id, status, notes, due_date, period, metadata }`
- Creates a log entry
- If `status = 'done'`, sets `completed_at = NOW()`

**PATCH /api/activities/log/:logId**
- Body: `{ status?, notes?, metadata? }`
- Merges `metadata` with JSONB merge (`||` operator) to preserve existing fields
- Sets `completed_at = NOW()` when status changes to `done`

### Route: `src/routes/settings.js`

**GET /api/settings**
Returns `{ ai_provider, has_api_key }` (never returns the raw key).

**PATCH /api/settings**
- Body: `{ ai_provider?, api_key? }`
- Encrypts `api_key` with AES before storing in `user_settings`

### Route: `src/routes/chat.js`

All routes require `authMiddleware`.

**GET /api/chat/sessions**
Returns last 50 sessions, ordered newest first, with first user message as `first_message`.

**POST /api/chat/sessions**
Creates a new session. Returns session row.

**GET /api/chat/sessions/:sessionId/messages**
Returns all messages for a session ordered `created_at ASC`.

**POST /api/chat/sessions/:sessionId/message** — core endpoint (see Section 6).

---

## 5. Frontend Specification

### `src/lib/api.js`

Axios instance with `baseURL: '/api'` (Vite proxies to `localhost:3001`).

- **Request interceptor**: reads `memobrain_token` from localStorage, adds `Authorization: Bearer` header
- **Response error interceptor**: on 401, clears localStorage and redirects to `/login`

### `src/hooks/useAuth.jsx`

React context providing:
- `user` — parsed from `memobrain_user` localStorage on init
- `login(email, password)` — calls `/api/auth/login`, stores token + user
- `register(email, password, name)` — calls `/api/auth/register`, stores token + user
- `logout()` — clears localStorage, sets user to null

### `src/hooks/useVoiceInput.js`

Wraps the Web Speech API (`SpeechRecognition`):
- Returns `{ isListening, transcript, startListening, stopListening, supported }`
- Caller is responsible for consuming `transcript` and clearing it after use

### `src/hooks/useNotifications.jsx`

Polls `/api/activities/dashboard` every 5 minutes. Fires browser notifications for overdue items if notification permission is granted.

### `src/pages/LoginPage.jsx`

Two-mode form (toggle Sign In / Register):
- Conditional name field for register mode
- Error display from API response
- Loading spinner on submit
- On success: navigate to `/`

### `src/pages/ChatPage.jsx`

Main layout: collapsible sidebar + right panel.

Right panel top-to-bottom:
1. **Header bar** — sidebar toggle, title
2. **DashboardStrip** — live status bar, re-fetches after any log action
3. **Messages area** — scrollable, auto-scrolls to bottom on new message
4. **Input area** — auto-resizing textarea, voice button, send button

**Sending a message:**
1. Trim input, return if empty or already sending
2. Ensure session exists (create one if `sessionId` is null)
3. Add optimistic user message to state immediately
4. POST to `/api/chat/sessions/:id/message`
5. On success: replace optimistic message + append assistant message
6. If `action.intent` is not `none`/`query`: call `window.__reloadDashboard()` and `window.__reloadSessions()`
7. On error: remove optimistic message

**Metadata form flow:**
After a successful log, if `action.ask_followup === true`, `MessageBubble` renders an inline `MetadataForm` pre-populated with any metadata already extracted by the AI. Submitting the form calls `PATCH /api/activities/log/:logId` to merge the additional fields.

**Keyboard:** Enter sends, Shift+Enter newline.

### `src/pages/ActivitiesPage.jsx`

Two-panel layout (list + detail).

**Mobile behaviour:** uses `mobileView` state (`'list'` | `'detail'`) to show only one panel at a time. Selecting an activity switches to detail view; a back chevron (mobile-only, `md:hidden`) returns to the list.

**Desktop behaviour:** both panels visible side by side as a fixed flex layout (`md:w-80` list + `flex-1` detail).

### `src/pages/SettingsPage.jsx`

- Loads current provider + `has_api_key` flag
- Lets user select provider (Claude / OpenAI) and enter/update API key
- Key is sent to backend via PATCH and encrypted before storage — never returned to frontend

### `src/components/MetadataForm.jsx`

Inline form rendered below an assistant message after a log action.

- `initialValues` prop pre-fills fields with data already extracted by the AI (amount, reference, etc.)
- Fields are defined per `category`: `bill` (amount, payment_method, reference), `task` (priority, location, duration), `event` (date, time, location, participants), `note` (tags)
- Only non-empty values are sent on save; empty submit triggers `onSkip`

### Design System (Tailwind)

**Color palette** (defined in `tailwind.config.js`):
- `slate-950` background, `slate-800/900` surfaces, `slate-300/400` text
- `primary-500` action colour, `success-400/500` done state, `error-400/500` overdue/danger
- `warning-500` pending/upcoming

**Component classes** (`src/index.css` under `@layer components`):
- `.card` — dark surface + border + rounded corners
- `.btn-primary` — primary colour background, white text
- `.btn-secondary` — muted border button
- `.btn-ghost` — text-only, hover background
- `.input-field` — dark input with primary focus ring

**Fonts** (loaded from Google Fonts):
- `Playfair Display` — display/logo
- `DM Sans` — body text
- `JetBrains Mono` — timestamps, codes

---

## 6. Claude AI Integration

Lives in `backend/src/services/ai.js` and called from `backend/src/routes/chat.js`.

### The Dual-Output Pattern

Every AI response contains two parts separated by `===ACTION===`:

```
Part 1: Natural language reply (shown to user)
===ACTION===
{ JSON action object (parsed by backend, never shown to user) }
```

### System Prompt

Built dynamically per request. Injected values:
- Today's date (ISO)
- Current month name + year
- User context: `{ currentPeriod, monthlyBills, pendingTasks, recentLogs }`

Key behavioural rules encoded in the prompt:
- Extract monetary amounts from natural language including Indian formats (`Rs.23,743.00`, `₹5,000`)
- Set `ask_followup: true` **only** when key details are genuinely missing (amount for bills, date for events) — if already present in the message, extract and set `false`
- For events without a date: ask the user, set `due_date: null`, `ask_followup: true`
- For advance payments: set `advance_months` to the number of months covered

### Action JSON Schema

```json
{
  "intent": "log_done|log_pending|log_event|query|confirm_done|add_details|none",
  "activity_title": "string or null",
  "category": "bill|task|event|note|null",
  "recurrence": "monthly|weekly|yearly|null",
  "due_date": "ISO datetime string or null",
  "period": "YYYY-MM or null",
  "advance_months": "integer or null",
  "metadata": { "amount": 0, "payment_method": "", "reference": "", "notes": "" },
  "query_type": "current_status|upcoming|history|overdue|null",
  "ask_followup": true
}
```

### Query Flow (two-pass AI)

When `intent === 'query'`:
1. First AI pass returns `query_type` and intent
2. Backend executes the appropriate DB query (history, current_status, upcoming, overdue)
3. Results injected into a second system prompt block: `QUERY RESULTS: [JSON]`
4. Second AI pass formulates a factual answer citing specific data

### POST /api/chat/sessions/:sessionId/message — Full Flow

```
1. Validate session belongs to user
2. Save user message to chat_messages
3. Fetch last 10 messages (conversation history)
4. Fetch user context (bills + tasks + recent logs)
5. Build system prompt with context injected
6. Call AI (Claude or OpenAI based on user_settings)
7. Parse response → split on '===ACTION==='
   - Part 0 = message text
   - Part 1 = JSON.parse() → action object
8. If intent is 'query': run DB query → second AI pass → override message
9. If intent is a log intent:
   a. Case-insensitive title match for existing activity
   b. If not found → INSERT new activity
   c. INSERT activity_log with status/metadata/due_date/period
10. Auto-title session: UPDATE title from first 60 chars if still 'New Session'
11. Save assistant message with metadata = { action, actionResult }
12. Return { message, action, actionResult }
```

### Activity Find-or-Create Logic

```js
const existing = await pool.query(
  `SELECT id FROM activities
   WHERE user_id = $1 AND LOWER(title) = LOWER($2) LIMIT 1`,
  [userId, activity_title]
)
// If found: reuse existing activity_id
// If not found: INSERT new activity, use returned id
```

---

## 7. Auth Flow

```
Register / Login
  → POST /api/auth/register or /login
  → Server returns { token (JWT, 30d), user: { id, email, name } }
  → Frontend stores:
      localStorage['memobrain_token'] = JWT string
      localStorage['memobrain_user']  = JSON.stringify(user)

Every API request
  → Axios interceptor reads memobrain_token
  → Adds header: Authorization: Bearer <token>

Token expiry / invalid
  → API returns 401
  → Axios interceptor clears localStorage
  → Redirects to /login

Logout
  → Clear both localStorage keys
  → Set user state to null
  → React Router redirects to /login
```

### Route Protection

```jsx
<Routes>
  <Route path="/login"      element={<PublicRoute><LoginPage /></PublicRoute>} />
  <Route path="/"           element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
  <Route path="/activities" element={<ProtectedRoute><ActivitiesPage /></ProtectedRoute>} />
  <Route path="/settings"   element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
</Routes>

// ProtectedRoute: if no user → Navigate to /login
// PublicRoute: if user → Navigate to /
```

### API Key Security

User AI keys are stored AES-encrypted in `user_settings.api_key_enc`. The `ENCRYPTION_KEY` env var (32-byte hex) is required. The raw key is never returned to the frontend — only `has_api_key: true/false`.

---

## 8. API Reference

All endpoints except auth require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | /api/auth/register | `{ email, password, name }` | `{ token, user }` |
| POST | /api/auth/login | `{ email, password }` | `{ token, user }` |

### Activities

| Method | Path | Body / Params | Returns |
|---|---|---|---|
| GET | /api/activities | `?include_inactive=true` | Array of activities with current-period status |
| GET | /api/activities/dashboard | — | `{ currentPeriod, bills[], upcoming[], overdue[] }` |
| GET | /api/activities/:id/logs | `?offset=0&limit=20` | `{ logs[], total }` |
| POST | /api/activities | `{ title, category, recurrence?, recurrence_day? }` | Created activity |
| PATCH | /api/activities/:id | `{ title?, category?, recurrence?, recurrence_day? }` | Updated activity |
| DELETE | /api/activities/:id | — | Sets `is_active = false` |
| POST | /api/activities/log | `{ activity_id, status?, notes?, due_date?, period?, metadata? }` | Created log |
| PATCH | /api/activities/log/:logId | `{ status?, notes?, metadata? }` | Updated log (metadata merged) |

### Chat

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/chat/sessions | — | Array of sessions (last 50) |
| POST | /api/chat/sessions | — | Created session |
| GET | /api/chat/sessions/:id/messages | — | Array of messages |
| POST | /api/chat/sessions/:id/message | `{ content }` | `{ message, action, actionResult }` |

### Settings

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/settings | — | `{ ai_provider, has_api_key }` |
| PATCH | /api/settings | `{ ai_provider?, api_key? }` | `{ success: true }` |

### System

| Method | Path | Returns |
|---|---|---|
| GET | /api/health | `{ status: 'ok', timestamp }` |

---

## 9. Developer Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally
- An Anthropic or OpenAI API key (entered via Settings in the UI)
- `ENCRYPTION_KEY` — a 32-byte hex string for AES encryption of stored API keys

### Step 1 — Clone and install

```bash
git clone <repo-url> && cd memobrain
npm install
cd backend && npm install
cd ../frontend && npm install && cd ..
```

### Step 2 — Backend `.env`

Create `backend/.env`:

```
PORT=3001
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/memobrain
JWT_SECRET=replace-with-long-random-string
ENCRYPTION_KEY=replace-with-64-char-hex-string
```

Generate `ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3 — Database

```bash
psql -U postgres -c "CREATE DATABASE memobrain;"
psql -U postgres -d memobrain -f database/init/01_schema.sql
```

### Step 4 — Run

```bash
# From project root
npm run dev
```

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

### Root `package.json` scripts

```json
{
  "scripts": {
    "dev": "concurrently \"cd backend && npm run dev\" \"cd frontend && npm run dev\""
  }
}
```

### Backend `package.json`

```json
{
  "type": "module",
  "scripts": {
    "dev": "nodemon src/index.js",
    "start": "node src/index.js"
  }
}
```

### Vite proxy (`vite.config.js`)

```js
server: {
  port: 5173,
  proxy: { '/api': 'http://localhost:3001' }
}
```

---

## 10. PWA / Android

The app ships with a `manifest.json` and is installable as a PWA.

### Install on Android

1. Ensure phone and computer are on the same Wi-Fi
2. Update `vite.config.js`:
   ```js
   server: { host: '0.0.0.0', port: 5173, proxy: { '/api': 'http://YOUR_LOCAL_IP:3001' } }
   ```
3. Update backend CORS to allow your LAN IP
4. Open `http://YOUR_LOCAL_IP:5173` in Chrome on Android
5. Tap ⋮ → **Add to Home Screen**

### Tailscale (optional remote access)

Install Tailscale on the server machine and access via the Tailscale IP — no port forwarding required.

### `manifest.json`

```json
{
  "name": "MemoBrain",
  "short_name": "MemoBrain",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#020617",
  "theme_color": "#6366f1"
}
```

---

## 11. Roadmap

### Phase 3 — Planned

| Feature | Notes |
|---|---|
| **Brain Sharing** | `brain_shares` table already in schema. Settings page to invite by email, read/write permission. Chat and activity queries JOIN shares to include shared data. |
| **Push Notifications** | Service worker + Web Push API. Backend stores subscription, nightly job pushes overdue alerts via `web-push` npm package. |
| **Yearly events** | `recurrence = 'yearly'` already supported. Dashboard needs a "This year" row; system prompt needs yearly examples. |
| **Export history** | `GET /api/export` → CSV stream of all activity logs via `json2csv`. |
| **Recurring auto-reset** | Nightly cron (node-cron) per user. Dashboard query already defaults to `pending` if no log for current period — no DB writes needed. |
| **Multi-device sync** | Already works if both devices point to the same backend. Only network accessibility needed (see PWA section). |

---

## 12. Notes for Claude Code

When implementing or extending features, work in this order:

1. `database/init/01_schema.sql` — create and run first, verify with `\dt` in psql
2. `backend/src/db/pool.js` + `backend/src/middleware/auth.js` — boilerplate, no logic
3. `backend/src/routes/auth.js` — test with curl before moving on
4. `backend/src/routes/activities.js` — test dashboard endpoint with a seeded user
5. `backend/src/services/ai.js` + `backend/src/routes/chat.js` — most complex; build `getUserContext` and `executeAction` as standalone functions first
6. Frontend scaffolding — Vite + Tailwind first, verify blank page loads
7. `src/lib/api.js` + `src/hooks/useAuth.jsx` — foundational, needed by all pages
8. `src/pages/LoginPage.jsx` — get auth working end-to-end before building chat
9. `src/components/DashboardStrip.jsx` — standalone, easy to test in isolation
10. `src/components/MessageBubble.jsx` + `MetadataForm.jsx` — pure display components
11. `src/components/SessionSidebar.jsx` — straightforward list component
12. `src/pages/ChatPage.jsx` — wire everything together last

**Key things to get right:**

- The `===ACTION===` split in `chat.js` is load-bearing — the AI must always output this separator
- The find-or-create activity logic must be case-insensitive to avoid duplicate entries
- `ask_followup` must be conditional — only `true` when key fields are missing; if already in the message, extract into `metadata` and set `false`
- `MetadataForm` receives `initialValues` from `action.metadata` — always pass it to avoid showing empty forms for data already captured
- Dashboard strip uses `window.__reloadDashboard` as a global — ChatPage sets this, DashboardStrip reads it
- The Axios 401 interceptor must redirect to `/login` otherwise users get stuck on expired tokens
- Vite proxy (`/api` → port 3001) means you never hardcode localhost URLs in frontend code
- API keys are AES-encrypted before DB storage — `ENCRYPTION_KEY` env var must be set
