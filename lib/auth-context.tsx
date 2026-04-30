'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  })

  const loadProfile = useCallback(async (userId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', userId)
      .single()
    return data as Profile | null
  }, [])

  useEffect(() => {
    const supabase = createClient()

    // 初始化：用 getSession() 读取本地缓存 session（不持有 auth lock，不与 signInWithPassword 竞争）
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null
      if (user) {
        const profile = await loadProfile(user.id)
        setState({ user, profile, loading: false })
      } else {
        setState({ user: null, profile: null, loading: false })
      }
    }).catch(() => {
      setState({ user: null, profile: null, loading: false })
    })

    // 监听后续登录/退出事件（跳过 INITIAL_SESSION，已由 getSession() 处理，避免重复锁竞争）
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') return
      const user = session?.user ?? null
      if (user) {
        const profile = await loadProfile(user.id)
        setState({ user, profile, loading: false })
      } else {
        setState({ user: null, profile: null, loading: false })
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
