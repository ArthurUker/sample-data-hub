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

// ── 独立于 Supabase 管理的 refresh_token 备份 key ────────────────────────────
// Supabase 触发 SIGNED_OUT 事件前会先清空它自己管理的 auth-token key。
// 我们用独立的 key 保存 refresh_token，使 SIGNED_OUT 恢复路径可用。
const BACKUP_KEY = 'app-rt-bk'

function saveRefreshBackup(refreshToken: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(BACKUP_KEY, refreshToken) } catch { /* ignore */ }
}

function loadRefreshBackup(): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(BACKUP_KEY) } catch { return null }
}

function clearRefreshBackup() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(BACKUP_KEY) } catch { /* ignore */ }
}

// ── 读取 Supabase 自管的 localStorage session ────────────────────────────────
type StoredSession = {
  user: User | null
  refreshToken: string | null
  expiresAt: number | null  // Unix seconds
}

function readStoredSession(): StoredSession {
  if (typeof window === 'undefined') return { user: null, refreshToken: null, expiresAt: null }
  try {
    const authKey = Object.keys(window.localStorage).find((k) => k.endsWith('-auth-token'))
    if (!authKey) return { user: null, refreshToken: null, expiresAt: null }
    const raw = window.localStorage.getItem(authKey)
    if (!raw) return { user: null, refreshToken: null, expiresAt: null }
    const p = JSON.parse(raw) as {
      user?: User
      refresh_token?: string
      expires_at?: number
    }
    return {
      user: p.user ?? null,
      refreshToken: p.refresh_token ?? null,
      expiresAt: p.expires_at ?? null,
    }
  } catch {
    return { user: null, refreshToken: null, expiresAt: null }
  }
}

// ── 类型 ─────────────────────────────────────────────────────────────────────

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

// ── AuthProvider ──────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  })

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const supabase = createClient()
    try {
      const result = await Promise.race([
        supabase.from('profiles').select('id, name, role').eq('id', userId).single(),
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error('timeout') }), 6000)
        ),
      ])
      return (result.data as Profile | null) ?? null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let active = true
    const setIfActive = (next: AuthState) => { if (active) setState(next) }

    const init = async () => {
      const stored = readStoredSession()
      const nowSec = Math.floor(Date.now() / 1000)
      // token 至少还有 60 秒有效期 → 立即使用，不等网络（消除"加载中"闪屏）
      const tokenStillValid = !!stored.user && !!stored.expiresAt && stored.expiresAt > nowSec + 60

      if (tokenStillValid && stored.user) {
        // 立即呈现已登录状态，profile 异步补充
        setIfActive({ user: stored.user, profile: null, loading: false })
        const profile = await loadProfile(stored.user.id)
        setIfActive({ user: stored.user, profile, loading: false })
        // 后台验证：让 Supabase 完成 token 校验/刷新，但不阻塞 UI
        supabase.auth.getSession().catch(() => {})
        return
      }

      // token 过期或不存在 → 尝试用 refresh_token 续期
      const refreshToken = stored.refreshToken ?? loadRefreshBackup()
      if (refreshToken) {
        try {
          const { data } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
          if (data.session) {
            saveRefreshBackup(data.session.refresh_token)
            const profile = await loadProfile(data.session.user.id)
            setIfActive({ user: data.session.user, profile, loading: false })
            return
          }
        } catch { /* 续期失败，继续往下 */ }
      }

      // 续期失败 or 无任何 token → 让 Supabase getSession() 最后决策
      try {
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession() as Promise<{ data: { session: Session | null } }>,
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 8000)
          ),
        ])
        if (session?.user) {
          saveRefreshBackup(session.refresh_token)
          const profile = await loadProfile(session.user.id)
          setIfActive({ user: session.user, profile, loading: false })
        } else {
          clearRefreshBackup()
          setIfActive({ user: null, profile: null, loading: false })
        }
      } catch {
        clearRefreshBackup()
        setIfActive({ user: null, profile: null, loading: false })
      }
    }

    void init()

    // ── onAuthStateChange ───────────────────────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, session: Session | null) => {
        if (event === 'INITIAL_SESSION') return

        // 每次成功登录/刷新 token，更新我们的独立备份
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.refresh_token) {
          saveRefreshBackup(session.refresh_token)
        }

        if (event === 'SIGNED_OUT') {
          // Supabase 在触发此事件前已清空自己管理的 localStorage key。
          // 用我们独立保存的备份 refresh_token 重试一次（对抗网络短暂抖动）。
          const backup = loadRefreshBackup()
          if (backup) {
            try {
              const { data } = await supabase.auth.refreshSession({ refresh_token: backup })
              if (data.session && active) {
                saveRefreshBackup(data.session.refresh_token)
                const profile = await loadProfile(data.session.user.id)
                setIfActive({ user: data.session.user, profile, loading: false })
                return
              }
            } catch { /* 续期失败 */ }
          }
          clearRefreshBackup()
          setIfActive({ user: null, profile: null, loading: false })
          return
        }

        const user = session?.user ?? null
        if (user) {
          const profile = await loadProfile(user.id)
          setIfActive({ user, profile, loading: false })
        } else {
          setIfActive({ user: null, profile: null, loading: false })
        }
      }
    )

    // ── visibilitychange：切回 tab 时主动检查续期 ──────────────────────────
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !active) return
      const stored = readStoredSession()
      const nowSec = Math.floor(Date.now() / 1000)
      const expiringSoon = !stored.expiresAt || stored.expiresAt < nowSec + 120 // 2分钟内到期
      if (!expiringSoon) return  // token 还充裕，不需要操作

      const refreshToken = stored.refreshToken ?? loadRefreshBackup()
      if (!refreshToken) return
      try {
        const { data } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
        if (data.session && active) {
          saveRefreshBackup(data.session.refresh_token)
          const profile = await loadProfile(data.session.user.id)
          setIfActive({ user: data.session.user, profile, loading: false })
        }
      } catch { /* 网络问题，等下次 */ }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadProfile])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}


export function useAuth() {
  return useContext(AuthContext)
}

