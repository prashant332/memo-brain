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
