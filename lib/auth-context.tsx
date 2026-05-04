'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import type { UserRole } from '@/types'

type Profile = {
  id: string
  name: string
  role: UserRole
}

type AuthState = {
  user: User | null
  profile: Profile | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  loading: true,
})

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('auth_timeout')), timeoutMs)
    }),
  ])
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  })

  const loadProfile = useCallback(async (userId: string) => {
    const supabase = createClient()
    try {
      const { data } = (await withTimeout(
        supabase
          .from('profiles')
          .select('id, name, role')
          .eq('id', userId)
          .single(),
        8000
      )) as { data: Profile | null }
      return (data ?? null) as Profile | null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()

    let active = true

    const setIfActive = (next: AuthState) => {
      if (active) setState(next)
    }

    const init = async () => {
      try {
        const {
          data: { session },
        } = (await withTimeout(
          supabase.auth.getSession(),
          8000
        )) as { data: { session: Session | null } }

        const user = session?.user ?? null
        if (user) {
          const profile = await loadProfile(user.id)
          setIfActive({ user, profile, loading: false })
        } else {
          setIfActive({ user: null, profile: null, loading: false })
        }
      } catch {
        setIfActive({ user: null, profile: null, loading: false })
      }
    }

    void init()

    // 监听后续登录/退出事件（跳过 INITIAL_SESSION，已由 getSession() 处理，避免重复锁竞争）
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: Session | null) => {
      if (event === 'INITIAL_SESSION') return
      const user = session?.user ?? null
      if (user) {
        const profile = await loadProfile(user.id)
        setIfActive({ user, profile, loading: false })
      } else {
        setIfActive({ user: null, profile: null, loading: false })
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
