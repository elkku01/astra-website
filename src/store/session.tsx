import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyCheckoutSession,
  applyRemoteOwned,
  getSession,
  loginWithToken,
  loginWithUsername,
  logoutStore,
  type PurchaseResult,
  type StoreUser,
} from './api'

type SessionContextValue = {
  user: StoreUser | null
  linking: boolean
  linkError: string
  linkWithToken: (token: string) => Promise<void>
  linkWithUsername: (username: string) => Promise<void>
  unlink: () => void
  applyPurchase: (ident?: string) => Promise<PurchaseResult>
  refreshUser: (username?: string) => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoreUser | null>(() => getSession())
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState('')

  useEffect(() => {
    let alive = true
    const pull = () => {
      void applyRemoteOwned().then((next) => {
        if (alive && next) setUser(next)
      })
    }
    pull()
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull()
    }
    window.addEventListener('focus', pull)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.removeEventListener('focus', pull)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    if (!user?.username || user.skinUrl) return
    void loginWithUsername(user.username)
      .then(setUser)
      .catch(() => {
        // Keep the linked username even if the skin lookup fails this time.
      })
  }, [user?.username, user?.skinUrl])

  const linkWithToken = useCallback(async (token: string) => {
    setLinking(true)
    setLinkError('')
    try {
      const next = await loginWithToken(token)
      setUser(next)
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : 'Could not link account')
      throw error
    } finally {
      setLinking(false)
    }
  }, [])

  const linkWithUsername = useCallback(async (username: string) => {
    setLinking(true)
    setLinkError('')
    try {
      const next = await loginWithUsername(username)
      setUser(next)
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : 'Could not link account')
      throw error
    } finally {
      setLinking(false)
    }
  }, [])

  const unlink = useCallback(() => {
    logoutStore()
    setUser(null)
  }, [])

  const applyPurchase = useCallback(async (ident?: string) => {
    const result = await applyCheckoutSession(ident)
    if (result.user) setUser(result.user)
    return result
  }, [])

  const refreshUser = useCallback(async (username?: string) => {
    const next = await applyRemoteOwned(username)
    if (next) setUser(next)
  }, [])

  const value = useMemo(
    () => ({
      user,
      linking,
      linkError,
      linkWithToken,
      linkWithUsername,
      unlink,
      applyPurchase,
      refreshUser,
    }),
    [user, linking, linkError, linkWithToken, linkWithUsername, unlink, applyPurchase, refreshUser],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}
