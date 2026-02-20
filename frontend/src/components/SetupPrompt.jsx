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
