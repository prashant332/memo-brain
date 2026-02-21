import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useAppContext } from '../context/AppContext'

export default function SharingPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { reloadSharedBrains } = useAppContext()

  const [shares, setShares] = useState({ sharedByMe: [], sharedWithMe: [] })
  const [loading, setLoading] = useState(true)
  const [shareEmail, setShareEmail] = useState('')
  const [sharePermission, setSharePermission] = useState('read')
  const [sharing, setSharing] = useState(false)

  const loadShares = useCallback(async () => {
    try {
      const { data } = await api.get('/shares')
      setShares(data)
    } catch (err) {
      console.error('Load shares error:', err)
      toast.error('Failed to load shares')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadShares()
  }, [loadShares])

  const handleShare = async (e) => {
    e.preventDefault()
    if (!shareEmail.trim()) return

    setSharing(true)
    try {
      await api.post('/shares', { email: shareEmail.trim(), permission: sharePermission })
      toast.success(`Brain shared with ${shareEmail}`)
      setShareEmail('')
      loadShares()
      reloadSharedBrains()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to share brain')
    } finally {
      setSharing(false)
    }
  }

  const handleRevoke = async (shareId) => {
    if (!confirm('Revoke this share?')) return
    try {
      await api.delete(`/shares/${shareId}`)
      toast.success('Share revoked')
      loadShares()
      reloadSharedBrains()
    } catch (err) {
      toast.error('Failed to revoke share')
    }
  }

  const handleChangePermission = async (shareId, permission) => {
    try {
      await api.patch(`/shares/${shareId}`, { permission })
      toast.success('Permission updated')
      loadShares()
    } catch (err) {
      toast.error('Failed to update permission')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">Brain Sharing</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Share with someone */}
        <section className="card p-5">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
            Share Your Brain
          </h2>
          <form onSubmit={handleShare} className="space-y-3">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Email address</label>
              <input
                type="email"
                value={shareEmail}
                onChange={e => setShareEmail(e.target.value)}
                placeholder="partner@example.com"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Permission</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="permission"
                    value="read"
                    checked={sharePermission === 'read'}
                    onChange={() => setSharePermission('read')}
                    className="text-primary-500"
                  />
                  <span className="text-sm">View only</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="permission"
                    value="read_write"
                    checked={sharePermission === 'read_write'}
                    onChange={() => setSharePermission('read_write')}
                    className="text-primary-500"
                  />
                  <span className="text-sm">View & update</span>
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={!shareEmail.trim() || sharing}
              className="btn-primary w-full"
            >
              {sharing ? 'Sharing...' : 'Share Brain'}
            </button>
          </form>
        </section>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Brains I've shared */}
            <section className="card p-5">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
                Shared by You ({shares.sharedByMe.length})
              </h2>
              {shares.sharedByMe.length === 0 ? (
                <p className="text-sm text-slate-500">You haven't shared your brain with anyone yet.</p>
              ) : (
                <div className="space-y-3">
                  {shares.sharedByMe.map(share => (
                    <div key={share.id} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{share.shared_with_name || share.shared_with_email}</p>
                        <p className="text-xs text-slate-500">{share.shared_with_email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={share.permission}
                          onChange={e => handleChangePermission(share.id, e.target.value)}
                          className="input-field text-xs py-1 px-2 w-auto"
                        >
                          <option value="read">View only</option>
                          <option value="read_write">View & update</option>
                        </select>
                        <button
                          onClick={() => handleRevoke(share.id)}
                          className="text-xs text-error-400 hover:text-error-300 transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Brains shared with me */}
            <section className="card p-5">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">
                Shared with You ({shares.sharedWithMe.length})
              </h2>
              {shares.sharedWithMe.length === 0 ? (
                <p className="text-sm text-slate-500">No one has shared their brain with you yet.</p>
              ) : (
                <div className="space-y-3">
                  {shares.sharedWithMe.map(share => (
                    <div key={share.id} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{share.owner_name || share.owner_email}</p>
                        <p className="text-xs text-slate-500">{share.owner_email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          share.permission === 'read_write'
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {share.permission === 'read_write' ? 'View & update' : 'View only'}
                        </span>
                        <button
                          onClick={() => handleRevoke(share.id)}
                          className="text-xs text-error-400 hover:text-error-300 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
