'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  // 保持单一 client 实例，避免重渲染时重复创建实例导致 auth lock 竞争
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 页面打开时即开始预取 samples 路由的 JS 包，登录完成后无需等待资源下载
  useEffect(() => {
    router.prefetch('/samples/')
  }, [router])

  // 提前预热 Railway 后端连接，降低登录请求的冷启动延迟
  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''
    if (apiBase) {
      fetch(`${apiBase}/health`).catch(() => {})
    }
  }, [])

  function persistSessionFallback(data: {
    accessToken: string
    refreshToken: string
    expiresIn?: number
    tokenType?: string
    user?: unknown
  }) {
    if (typeof window === 'undefined') return

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
      const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
      const storageKey = `sb-${projectRef}-auth-token`
      const nowSec = Math.floor(Date.now() / 1000)

      const payload = {
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
        user: data.user ?? null,
        token_type: data.tokenType ?? 'bearer',
        expires_in: data.expiresIn ?? 3600,
        expires_at: nowSec + (data.expiresIn ?? 3600),
      }

      window.localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch {
      // Ignore fallback storage errors and continue to normal setSession flow.
    }
  }

  async function waitForSessionReady(maxAttempts = 10, intervalMs = 120) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) return true
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    return false
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''
      const resp = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      if (!resp.ok) {
        setError('用户名或密码错误，请重试')
        setLoading(false)
        return
      }

      const loginData = (await resp.json()) as {
        accessToken: string
        refreshToken: string
        expiresIn?: number
        tokenType?: string
        user?: unknown
      }

      persistSessionFallback(loginData)

      let setSessionError: { message: string } | null = null
      let sessionFromSetSession = false
      try {
        const setSessionResult = await Promise.race([
          supabase.auth.setSession({
            access_token: loginData.accessToken,
            refresh_token: loginData.refreshToken,
          }),
          new Promise<{ error: { message: string } | null }>((resolve) => {
            setTimeout(() => resolve({ error: { message: 'set_session_timeout' } }), 5000)
          }),
        ])

        setSessionError = setSessionResult.error
        // setSession 成功时直接携带 session 对象，可以跳过后续轮询
        sessionFromSetSession = !setSessionError && !!((setSessionResult as { data?: { session?: unknown } }).data?.session)
      } catch {
        setSessionError = { message: 'set_session_failed' }
      }

      if (setSessionError && setSessionError.message !== 'set_session_timeout') {
        setError('登录状态建立失败，请重试')
        setLoading(false)
        return
      }

      // setSession 已确认返回 session，无需轮询，直接跳转
      if (!sessionFromSetSession) {
        const sessionReady = await waitForSessionReady()
        if (!sessionReady) {
          setError('登录状态同步超时，请重试')
          setLoading(false)
          return
        }
      }

      // 用 location.href 强制完整刷新，避免 AuthProvider 状态更新前 MainLayout 就检查 user 导致竞态
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
      window.location.href = basePath + '/samples/'
    } catch {
      setError('登录失败，请稍后再试')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">样本数据平台</h1>
        <p className="text-sm text-gray-500 mb-8">请使用分配的账号登录</p>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              用户名
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
