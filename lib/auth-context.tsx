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

// ── 同步读取 localStorage 中的用户（避免页面刷新时出现加载闪屏）────────────
// 只读 user 对象，不做任何 token 刷新操作，token 管理完全交给 Supabase。
function readStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const key = Object.keys(window.localStorage).find((k) => k.endsWith('-auth-token'))
    if (!key) return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const p = JSON.parse(raw) as { user?: User; expires_at?: number }
    // token 已过期则不使用（Supabase 的 autoRefreshToken 会在 INITIAL_SESSION 中处理）
    const nowSec = Math.floor(Date.now() / 1000)
    if (p.expires_at && p.expires_at < nowSec) return null
    return p.user ?? null
  } catch {
    return null
  }
}

// ── 类型 ─────────────────────────────────────────────────────────────────────

type Profile = { id: string; name: string; role: UserRole }

type AuthState = { user: User | null; profile: Profile | null; loading: boolean }

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true })

// ── AuthProvider ──────────────────────────────────────────────────────────────
// 策略：
//   1. 从 localStorage 同步读取用户对象 → 立即渲染，无加载闪屏
//   2. 完全依赖 Supabase 的 autoRefreshToken 管理 token 刷新
//   3. 通过 onAuthStateChange 响应所有会话变化，不做任何手动 refreshSession 调用
//   4. 不维护自定义备份 key，消除多路并发刷新导致 refresh_token 单次使用冲突的问题

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // useState initializer 在组件创建时同步执行，pre-populate user 避免 loading 闪屏
  const [state, setState] = useState<AuthState>(() => {
    const user = readStoredUser()
    return { user, profile: null, loading: true }
  })

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const supabase = createClient()
    try {
      const { data } = await Promise.race([
        supabase.from('profiles').select('id, name, role').eq('id', userId).single(),
        new Promise<{ data: null }>((resolve) =>
          setTimeout(() => resolve({ data: null }), 6000)
        ),
      ])
      return (data as Profile | null) ?? null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let active = true

    // onAuthStateChange 在挂载时会同步触发一次 INITIAL_SESSION，
    // 携带当前有效 session（Supabase 已自动处理过期刷新）。
    // 所有后续的 TOKEN_REFRESHED / SIGNED_OUT 也通过此回调驱动状态。
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!active) return

        if (event === 'SIGNED_OUT') {
          setState({ user: null, profile: null, loading: false })
          return
        }

        // INITIAL_SESSION、SIGNED_IN、TOKEN_REFRESHED、USER_UPDATED
        const user = session?.user ?? null
        if (user) {
          const profile = await loadProfile(user.id)
          if (active) setState({ user, profile, loading: false })
        } else {
          setState({ user: null, profile: null, loading: false })
        }
      }
    )

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

