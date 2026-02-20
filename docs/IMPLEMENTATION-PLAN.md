# MemoBrain Implementation Plan

> Complete implementation guide for building MemoBrain - a chat-first personal memory assistant.

---

## Overview

MemoBrain allows users to log bills, tasks, and events through natural conversation. The AI (Claude or OpenAI, user's choice) interprets messages and stores structured data in PostgreSQL.

### Key Features (MVP)
- Natural language activity logging ("Paid electricity bill today")
- Query existing data ("Did I pay water bill this month?")
- Dashboard showing bills status, overdue, and upcoming items
- Session-based chat history
- Multi-provider AI (BYOT - Bring Your Own Token)
- PWA support for mobile installation

### Tech Stack
- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Node.js + Express (ES Modules)
- **Database:** PostgreSQL 14+
- **AI:** Claude API or OpenAI API (user configurable)
- **Auth:** JWT (self-managed, 30-day tokens)

---

## Phase Summary

| Phase | Focus | Files | Est. Time |
|-------|-------|-------|-----------|
| **Phase 1** | Foundation & Auth | 15 files | 2-3 hours |
| **Phase 2** | Settings & AI Config | 4 files | 1-2 hours |
| **Phase 3** | Activities & Dashboard | 4 files | 1-2 hours |
| **Phase 4** | Chat & AI Integration | 8 files | 3-4 hours |
| **Phase 5** | Polish & PWA | 8 files | 1-2 hours |

**Total estimated time:** 8-13 hours

---

## Phase 1: Foundation & Auth
**File:** [PHASE-1-FOUNDATION.md](./phases/PHASE-1-FOUNDATION.md)

Sets up the complete project structure with working authentication.

**Deliverables:**
- Monorepo structure (backend + frontend)
- PostgreSQL schema with all tables
- Express backend with JWT auth
- React frontend with Vite + Tailwind
- Login/Register pages
- Protected routing

**Key Files:**
```
database/schema.sql
backend/src/routes/auth.js
frontend/src/pages/LoginPage.jsx
frontend/src/hooks/useAuth.jsx
```

---

## Phase 2: Settings & AI Config
**File:** [PHASE-2-SETTINGS.md](./phases/PHASE-2-SETTINGS.md)

Adds user settings page for AI provider selection and API key management.

**Deliverables:**
- Settings page UI
- Provider toggle (Claude/OpenAI)
- Encrypted API key storage
- Key verification endpoint

**Key Files:**
```
backend/src/routes/settings.js
backend/src/utils/encryption.js
frontend/src/pages/SettingsPage.jsx
```

---

## Phase 3: Activities & Dashboard
**File:** [PHASE-3-ACTIVITIES.md](./phases/PHASE-3-ACTIVITIES.md)

Backend routes for activities and the visual dashboard strip.

**Deliverables:**
- Activities CRUD routes
- Dashboard data endpoint
- DashboardStrip component
- Activity logging

**Key Files:**
```
backend/src/routes/activities.js
frontend/src/components/DashboardStrip.jsx
frontend/src/components/CategoryBadge.jsx
```

---

## Phase 4: Chat & AI Integration
**File:** [PHASE-4-CHAT.md](./phases/PHASE-4-CHAT.md)

The core chat system with multi-provider AI integration.

**Deliverables:**
- Chat sessions management
- Message endpoint with AI calls
- Multi-provider AI service
- Action parsing and execution
- Complete ChatPage layout
- Session sidebar
- Message bubbles

**Key Files:**
```
backend/src/services/ai.js
backend/src/routes/chat.js
frontend/src/pages/ChatPage.jsx
frontend/src/components/SessionSidebar.jsx
frontend/src/components/MessageBubble.jsx
```

---

## Phase 5: Polish & PWA
**File:** [PHASE-5-POLISH.md](./phases/PHASE-5-POLISH.md)

Final polish, error handling, and PWA setup.

**Deliverables:**
- Toast notification system
- Error boundary
- First-time setup prompt
- PWA icons and manifest
- Offline indicator
- Mobile optimizations

**Key Files:**
```
frontend/src/components/Toast.jsx
frontend/src/components/ErrorBoundary.jsx
frontend/src/components/SetupPrompt.jsx
frontend/public/manifest.json
```

---

## Quick Start After Implementation

### 1. Install Dependencies
```bash
# Root
npm install

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Setup Database
```bash
psql -U postgres -c "CREATE DATABASE memobrain;"
psql -U postgres -d memobrain -f database/schema.sql
```

### 3. Configure Environment
Create `backend/.env`:
```
PORT=3001
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/memobrain
JWT_SECRET=your-32-char-random-string-here
ENCRYPTION_KEY=32-char-hex-string-for-encryption
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Run Development
```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### 5. First Use
1. Register an account
2. Go to Settings
3. Select AI provider (Claude or OpenAI)
4. Add your API key
5. Start chatting!

---

## Database Schema Overview

```
users           → User accounts
user_settings   → AI provider + encrypted API key
activities      → Activity templates (bills, tasks, events)
activity_logs   → Logged instances with status/dates
chat_sessions   → Conversation sessions
chat_messages   → Individual messages with metadata
brain_shares    → (Phase 2) Sharing between users
```

---

## API Endpoints Summary

### Auth (Public)
- `POST /api/auth/register` → Create account
- `POST /api/auth/login` → Get JWT token

### Settings (Protected)
- `GET /api/settings` → Get user settings
- `PUT /api/settings` → Update provider/key
- `POST /api/settings/verify-key` → Test API key

### Activities (Protected)
- `GET /api/activities` → List activities
- `GET /api/activities/dashboard` → Dashboard data
- `POST /api/activities` → Create activity
- `POST /api/activities/log` → Create log entry
- `PATCH /api/activities/log/:id` → Update log

### Chat (Protected)
- `GET /api/chat/sessions` → List sessions
- `POST /api/chat/sessions` → Create session
- `GET /api/chat/sessions/:id/messages` → Get messages
- `POST /api/chat/sessions/:id/message` → Send message (AI)
- `DELETE /api/chat/sessions/:id` → Delete session

---

## Key Implementation Details

### AI Dual-Output Pattern
Every AI response contains:
```
Natural language reply for user
===ACTION===
{ JSON action object for backend }
```

### Activity Find-or-Create
Activities are matched case-insensitively to avoid duplicates:
```sql
WHERE LOWER(title) = LOWER($1)
```

### Secure Token Storage
API keys are encrypted with AES-256-GCM before storage:
```
iv:authTag:encryptedData
```

### Global Dashboard Refresh
Chat actions trigger dashboard updates via:
```js
window.__reloadDashboard?.()
window.__reloadSessions?.()
```

---

## Phase 2 Roadmap (Future)

After MVP completion, these features are planned:
- Recurring task auto-reset
- Push notifications (Web Push API)
- Brain sharing between users
- Yearly events support
- Export to CSV
- Multi-device sync

---

## Color Palette Reference

| Color | Hex | Usage |
|-------|-----|-------|
| slate-950 | #0a0a0f | Background |
| slate-900 | #12121a | Cards, surfaces |
| slate-800 | #22222e | Borders, inputs |
| primary-500 | #3b82f6 | Primary actions |
| success-500 | #22c55e | Done/completed |
| warning-500 | #f59e0b | Pending/warning |
| error-500 | #ef4444 | Overdue/errors |
| purple-500 | #a855f7 | Events |
