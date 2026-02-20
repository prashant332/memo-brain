# Phase 5: Polish & PWA

> Final polish, error handling improvements, PWA setup, and mobile optimization.

---

## Goals
- [ ] Comprehensive error handling with user notifications
- [ ] Toast/notification system
- [ ] PWA icons and manifest completion
- [ ] Mobile responsiveness final pass
- [ ] Loading states and skeletons
- [ ] First-time user onboarding hint

---

## 5.1 Toast Notification System

### frontend/src/components/Toast.jsx
```jsx
import { useState, useEffect, createContext, useContext, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    }

    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    info: (msg) => addToast(msg, 'info'),
    warning: (msg) => addToast(msg, 'warning')
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onRemove }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  const handleRemove = () => {
    setIsVisible(false)
    setTimeout(onRemove, 200)
  }

  const typeStyles = {
    success: 'bg-success-500/20 border-success-500/30 text-success-300',
    error: 'bg-error-500/20 border-error-500/30 text-error-300',
    warning: 'bg-warning-500/20 border-warning-500/30 text-warning-300',
    info: 'bg-primary-500/20 border-primary-500/30 text-primary-300'
  }

  const icons = {
    success: (
      <svg className="w-5 h-5 text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 text-error-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5 text-warning-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }

  return (
    <div
      className={`
        flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm
        transition-all duration-200
        ${typeStyles[toast.type]}
        ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}
      `}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        onClick={handleRemove}
        className="text-slate-400 hover:text-slate-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
```

### Update frontend/src/main.jsx
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './components/Toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
```

---

## 5.2 Update ChatPage with Toast Notifications

### frontend/src/pages/ChatPage.jsx (updated handleSend)
```jsx
// Add import at top:
import { useToast } from '../components/Toast'

// Inside ChatPage component, add:
const toast = useToast()

// Update the catch block in handleSend:
} catch (err) {
  console.error('Send error:', err)
  // Remove optimistic message on error
  setMessages((prev) => prev.filter((m) => !m.id.startsWith('temp-')))

  // Show error toast
  const errorMsg = err.response?.data?.error || 'Failed to send message'
  toast.error(errorMsg)
} finally {
```

---

## 5.3 First-Time Setup Prompt

### frontend/src/components/SetupPrompt.jsx
```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'

export default function SetupPrompt() {
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    checkSetup()
  }, [])

  const checkSetup = async () => {
    try {
      const { data } = await api.get('/settings')
      // Show prompt if no API key configured
      if (!data.has_api_key) {
        setShow(true)
      }
    } catch (err) {
      console.error('Check setup error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card p-6 max-w-md w-full animate-slide-up">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Welcome to MemoBrain!</h2>
          <p className="text-slate-400 text-sm">
            To get started, you'll need to add your AI API key. This lets you chat with your personal memory assistant.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/settings')}
            className="btn-primary w-full py-3"
          >
            Set Up API Key
          </button>
          <button
            onClick={() => setShow(false)}
            className="btn-ghost w-full"
          >
            I'll do this later
          </button>
        </div>
      </div>
    </div>
  )
}
```

### Update ChatPage to include SetupPrompt
```jsx
// Add import:
import SetupPrompt from '../components/SetupPrompt'

// Add at the end of the return, before closing </div>:
<SetupPrompt />
```

---

## 5.4 PWA Icons

Create SVG placeholder icons that can be converted to PNG.

### frontend/public/icon.svg
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0a0a0f"/>
  <circle cx="256" cy="200" r="80" fill="#3b82f6" opacity="0.3"/>
  <circle cx="256" cy="200" r="60" fill="#3b82f6" opacity="0.5"/>
  <circle cx="256" cy="200" r="40" fill="#3b82f6"/>
  <path d="M160 320 Q256 400 352 320" stroke="#3b82f6" stroke-width="24" fill="none" stroke-linecap="round"/>
  <circle cx="180" cy="360" r="16" fill="#22c55e"/>
  <circle cx="256" cy="380" r="16" fill="#f59e0b"/>
  <circle cx="332" cy="360" r="16" fill="#3b82f6"/>
</svg>
```

**Note:** Convert this SVG to PNG using a tool like:
- https://svgtopng.com/
- Or run: `npx svg2png-cli icon.svg -o icon-192.png -w 192 -h 192`
- Create both 192x192 and 512x512 versions

---

## 5.5 Enhanced Error Boundary

### frontend/src/components/ErrorBoundary.jsx
```jsx
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
          <div className="card p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-error-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-error-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-slate-400 text-sm mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
```

### Update frontend/src/main.jsx
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
```

---

## 5.6 Mobile Optimizations

### Update frontend/src/index.css (add mobile utilities)
```css
/* Add to @layer base */
@layer base {
  /* ... existing styles ... */

  /* Safe area padding for notched devices */
  .safe-bottom {
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .safe-top {
    padding-top: env(safe-area-inset-top, 0);
  }

  /* Prevent text selection on interactive elements */
  .no-select {
    -webkit-user-select: none;
    user-select: none;
  }

  /* Better touch targets */
  .touch-target {
    min-height: 44px;
    min-width: 44px;
  }
}
```

### Update frontend/index.html (mobile meta tags)
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#0a0a0f" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="MemoBrain" />
    <title>MemoBrain</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
  </head>
  <body class="bg-slate-950 text-slate-100">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

## 5.7 Offline Indicator

### frontend/src/components/OfflineIndicator.jsx
```jsx
import { useState, useEffect } from 'react'

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-warning-500 text-slate-900 px-4 py-2 text-center text-sm font-medium safe-top">
      You're offline. Some features may not work.
    </div>
  )
}
```

### Add to App.jsx
```jsx
// Add import:
import OfflineIndicator from './components/OfflineIndicator'

// Add at the start of the return:
return (
  <>
    <OfflineIndicator />
    <Routes>
      {/* ... routes ... */}
    </Routes>
  </>
)
```

---

## 5.8 Final Update to manifest.json

### frontend/public/manifest.json
```json
{
  "name": "MemoBrain",
  "short_name": "MemoBrain",
  "description": "Your personal memory assistant - track bills, tasks, and events through natural conversation",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0a0a0f",
  "theme_color": "#0a0a0f",
  "categories": ["productivity", "utilities"],
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

---

## 5.9 Verification Checklist

After Phase 5, verify:

**Toast Notifications:**
- [ ] Success toast appears on settings save
- [ ] Error toast appears on API failures
- [ ] Toasts auto-dismiss after 4 seconds
- [ ] Manual dismiss works

**Error Handling:**
- [ ] Error boundary catches React errors
- [ ] Refresh button on error page works
- [ ] API errors show user-friendly messages
- [ ] No API key error redirects to settings

**PWA:**
- [ ] Manifest loads correctly (check DevTools > Application)
- [ ] Icons display in manifest
- [ ] "Add to Home Screen" works on Android
- [ ] App opens in standalone mode from home screen
- [ ] Theme color matches app background

**Mobile:**
- [ ] Sidebar toggle works on mobile
- [ ] Overlay closes sidebar on tap
- [ ] Input doesn't zoom on focus (viewport meta)
- [ ] Safe area padding works on notched devices
- [ ] Touch targets are 44px minimum

**Offline:**
- [ ] Offline indicator shows when disconnected
- [ ] Indicator hides when back online

---

## Files Created/Modified in Phase 5

**New Files:**
```
frontend/src/components/Toast.jsx
frontend/src/components/SetupPrompt.jsx
frontend/src/components/ErrorBoundary.jsx
frontend/src/components/OfflineIndicator.jsx
frontend/public/icon.svg
frontend/public/icon-192.png (generated)
frontend/public/icon-512.png (generated)
```

**Modified Files:**
```
frontend/src/main.jsx           # Add ToastProvider, ErrorBoundary
frontend/src/pages/ChatPage.jsx # Add toast usage, SetupPrompt
frontend/src/App.jsx            # Add OfflineIndicator
frontend/src/index.css          # Add mobile utilities
frontend/index.html             # Add mobile meta tags
frontend/public/manifest.json   # Complete PWA config
```

---

## Final Project Structure

```
memo-brain/
├── package.json
├── docs/
│   └── phases/
│       ├── PHASE-1-FOUNDATION.md
│       ├── PHASE-2-SETTINGS.md
│       ├── PHASE-3-ACTIVITIES.md
│       ├── PHASE-4-CHAT.md
│       └── PHASE-5-POLISH.md
├── database/
│   └── schema.sql
├── backend/
│   ├── package.json
│   ├── .env
│   └── src/
│       ├── index.js
│       ├── db/
│       │   └── pool.js
│       ├── utils/
│       │   └── encryption.js
│       ├── middleware/
│       │   └── auth.js
│       ├── services/
│       │   └── ai.js
│       └── routes/
│           ├── auth.js
│           ├── settings.js
│           ├── activities.js
│           └── chat.js
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── public/
    │   ├── manifest.json
    │   ├── icon.svg
    │   ├── icon-192.png
    │   └── icon-512.png
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── lib/
        │   └── api.js
        ├── hooks/
        │   └── useAuth.jsx
        ├── components/
        │   ├── CategoryBadge.jsx
        │   ├── DashboardStrip.jsx
        │   ├── ErrorBoundary.jsx
        │   ├── MessageBubble.jsx
        │   ├── OfflineIndicator.jsx
        │   ├── SessionSidebar.jsx
        │   ├── SetupPrompt.jsx
        │   ├── Toast.jsx
        │   └── TypingIndicator.jsx
        └── pages/
            ├── ChatPage.jsx
            ├── LoginPage.jsx
            └── SettingsPage.jsx
```
