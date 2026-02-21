# MemoBrain

> Your personal memory assistant — just tell it what you did, and it remembers.

---

## What is MemoBrain?

MemoBrain is a chat-based app that helps you track bills, tasks, and events by simply typing what's on your mind — no forms, no menus. It understands plain language and stores everything so you can ask questions later.

**Examples of what you can type:**

- `"Paid electricity bill today"` → marks it as done for this month
- `"Remind me to visit the bank on Friday"` → schedules a pending task
- `"Did I pay the water bill this month?"` → gives you a real answer from your history
- `"What's overdue?"` → summarises everything you've missed

---

## Who is it for?

Anyone who wants to keep track of recurring bills, tasks, or events without using spreadsheets or complicated apps. It works best as a home screen app on your phone (Android) or in a browser on your desktop.

---

## Key Concepts

| Term | What it means |
|------|---------------|
| **Activity** | Something you track regularly — e.g. "Electricity Bill" (monthly) or "Visit Bank" |
| **Log** | A record of one instance — e.g. Electricity Bill paid on 15 Feb 2026 |
| **Session** | A single chat conversation. All past sessions are saved and searchable |
| **Dashboard Strip** | The bar at the top of chat showing overdue items, bill statuses, and upcoming tasks |

---

## What You Need to Run It

Before you start, make sure you have these installed on your computer:

- **Node.js** (version 18 or newer) — [download here](https://nodejs.org)
- **PostgreSQL** (version 14 or newer) — [download here](https://www.postgresql.org/download)
- **An Anthropic API key** — sign up at [console.anthropic.com](https://console.anthropic.com) and create a key

---

## Setup Guide

### Step 1 — Get the code

Download or clone this repository to your computer, then open a terminal in the project folder.

### Step 2 — Install dependencies

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### Step 3 — Create the database

Open a terminal and run:

```bash
psql -U postgres -c "CREATE DATABASE memobrain;"
psql -U postgres -d memobrain -f database/init/01_schema.sql
```

### Step 4 — Configure the backend

Inside the `backend/` folder, create a file called `.env` with the following content (fill in your own values):

```
PORT=3001
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/memobrain
JWT_SECRET=any-long-random-string-you-make-up
```

### Step 5 — Add your AI API key

Log in to the app after registering, go to **Settings**, and paste your Anthropic (or OpenAI) API key there. The app stores it securely.

### Step 6 — Start the app

```bash
npm run dev
```

Then open your browser and go to: **http://localhost:5173**

Register with any email and password, and start chatting.

---

## Using the App

1. **Register** — create an account with your name, email, and password
2. **Chat** — type anything in the chat box; the AI will log it or answer your question
3. **Dashboard Strip** — glance at the top bar to see overdue items, bill statuses, and tasks due this week
4. **Activities page** — view and manage all your tracked activities and their history
5. **Session history** — tap any past session in the sidebar to scroll back through it

---

## Installing on Your Phone (Android)

1. Make sure your phone and computer are on the same Wi-Fi
2. Find your computer's local IP address (e.g. `192.168.1.10`)
3. Open Chrome on your Android phone and go to `http://192.168.1.10:5173`
4. Tap the menu (⋮) → **Add to Home Screen**
5. MemoBrain will appear as an app icon on your home screen

---

## Technical Documentation

For architecture, database schema, API reference, AI integration details, and developer setup, see the **[Design Document](./DESIGN.md)**.

---

## Reporting Issues

Log bugs and enhancement requests in **[ISSUES.md](./ISSUES.md)**.
