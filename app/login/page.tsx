'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  // 保持单一 client 实例，避免重渲染时重复创建实例导致 auth lock 竞争
  const supabase = useMemo(() => createClient(), [])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: loginData.accessToken,
        refresh_token: loginData.refreshToken,
      })

      if (setSessionError) {
        setError('登录状态建立失败，请重试')
        setLoading(false)
        return
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
