import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const { user } = useAuth()
  const [activeBrainOwnerId, setActiveBrainOwnerId] = useState(null)
  const [sharedBrains, setSharedBrains] = useState([])

  const loadSharedBrains = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await api.get('/shares')
      setSharedBrains(data.sharedWithMe || [])
    } catch {
      // Shares endpoint may not be available yet
      setSharedBrains([])
    }
  }, [user])

  useEffect(() => {
    loadSharedBrains()
  }, [loadSharedBrains])

  // Reset to own brain if user logs out
  useEffect(() => {
    if (!user) {
      setActiveBrainOwnerId(null)
      setSharedBrains([])
    }
  }, [user])

  return (
    <AppContext.Provider value={{
      activeBrainOwnerId,
      setActiveBrainOwnerId,
      sharedBrains,
      reloadSharedBrains: loadSharedBrains
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
