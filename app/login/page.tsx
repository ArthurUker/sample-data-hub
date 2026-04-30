'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // 通过用户名查找对应邮箱
    const { data: profile, error: profileError } = await supabase
      .schema('sample_data_hub')
      .from('profiles')
      .select('id')
      .eq('name', username.trim())
      .maybeSingle()

    if (profileError || !profile) {
      setError('用户名或密码错误，请重试')
      setLoading(false)
      return
    }

    // 从 auth.users 获取邮箱（通过 admin 无法在客户端访问，改为直接用 username@internal 格式邮箱登录）
    // 实际上 Supabase 只支持邮箱/手机号登录，我们查到用户 ID 后需要获取邮箱
    // 通过 RPC 函数获取该用户的邮箱
    const { data: emailData, error: emailError } = await supabase
      .schema('sample_data_hub')
      .rpc('get_email_by_profile_id', { profile_id: profile.id })

    if (emailError || !emailData) {
      setError('用户名或密码错误，请重试')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailData as string,
      password,
    })

    if (signInError) {
      setError('用户名或密码错误，请重试')
      setLoading(false)
      return
    }

    router.push('/samples')
    router.refresh()
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
