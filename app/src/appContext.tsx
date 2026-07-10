import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LocalStore, type DataStore } from './store/localStore'
import type { UserProfile } from './types'

interface AppCtx {
  store: DataStore
  profile: UserProfile | null
  profileLoaded: boolean
  setProfile: (p: UserProfile) => Promise<void>
}

const Ctx = createContext<AppCtx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new LocalStore(), [])
  const [profile, setProfileState] = useState<UserProfile | null>(null)
  const [profileLoaded, setLoaded] = useState(false)

  useEffect(() => {
    store.getProfile().then((p) => {
      setProfileState(p)
      setLoaded(true)
    })
  }, [store])

  const setProfile = async (p: UserProfile) => {
    await store.saveProfile(p)
    setProfileState(p)
  }

  return <Ctx.Provider value={{ store, profile, profileLoaded, setProfile }}>{children}</Ctx.Provider>
}

export function useApp(): AppCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}

/** Object URL for a take's media blob, revoked on unmount. */
export function useMediaUrl(takeId: string | undefined): string | undefined {
  const { store } = useApp()
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!takeId) return
    let revoke: string | undefined
    let alive = true
    store.getMedia(takeId).then((blob) => {
      if (blob && alive) {
        revoke = URL.createObjectURL(blob)
        setUrl(revoke)
      }
    })
    return () => {
      alive = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [store, takeId])
  return url
}
