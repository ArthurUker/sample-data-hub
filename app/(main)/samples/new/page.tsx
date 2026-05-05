'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'

export default function NewSamplePage() {
  const router = useRouter()
  const supabase = createClient()
  const { profile, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const canCreate = profile?.role === 'ADMIN' || profile?.role === 'OPERATOR'
  const draftKey = useMemo(
    () => `sample-data-hub:draft:new-sample:${profile?.id ?? 'anonymous'}`,
    [profile?.id]
  )

  const [form, setForm] = useState({
    id: '',
    sample_type: '',
    sample_source: '',
    collection_date: '',
    submission_date: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !canCreate) return
    const raw = window.localStorage.getItem(draftKey)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as { form?: typeof form }
      if (parsed.form) {
        setForm(parsed.form)
        setDraftRestored(true)
      }
    } catch {
      // Ignore broken draft payload.
    }
  }, [draftKey, canCreate])

  useEffect(() => {
    if (typeof window === 'undefined' || !canCreate) return
    const hasAnyValue = Object.values(form).some((v) => String(v).trim() !== '')
    if (!hasAnyValue) return

    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({ form, updatedAt: Date.now() })
      )
    }, 500)

    return () => window.clearTimeout(timer)
  }, [form, draftKey, canCreate])

  function clearDraft() {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(draftKey)
    setDraftRestored(false)
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        加载中...
      </div>
    )
  }

  if (!canCreate) {
    return (
      <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-xl font-semibold text-gray-900">数据录入</h1>
        <p className="text-sm text-gray-500 mt-2">
          当前账号没有录入权限。请联系管理员开通录入员或管理员角色。
        </p>
        <div className="mt-4 space-y-2 text-sm text-gray-700">
          <p>录入有两种方式：</p>
          <p>1. 新建样本并录入：在本页完成。</p>
          <p>2. 现有样本追加录入：在样本台账行内点击“录入记录”。</p>
        </div>
        <div className="mt-4">
          <Link
            href="/samples"
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            返回样本台账
          </Link>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.from('samples').insert({
      id: form.id.trim(),
      sample_type: form.sample_type,
      sample_source: form.sample_source || null,
      collection_date: form.collection_date || null,
      submission_date: form.submission_date || null,
    })

    if (error) {
      if (error.code === '23505') {
        setError(`样本编号 "${form.id}" 已存在`)
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    router.push(`/samples/detail?id=${form.id}`)
    clearDraft()
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">新建样本</h1>
        <p className="text-sm text-gray-500 mt-0.5">样本编号全局唯一，创建后不可修改</p>
      </div>

      {draftRestored && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
          <span>已恢复上次未提交的录入草稿。</span>
          <button onClick={clearDraft} className="underline">
            清空草稿
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            样本编号 <span className="text-red-500">*</span>
          </label>
          <input
            name="id"
            required
            value={form.id}
            onChange={handleChange}
            placeholder="例：SMP-2024-001"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            样本类型 <span className="text-red-500">*</span>
          </label>
          <input
            name="sample_type"
            required
            value={form.sample_type}
            onChange={handleChange}
            placeholder="例：鼻咽拭子"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            样本来源
          </label>
          <input
            name="sample_source"
            value={form.sample_source}
            onChange={handleChange}
            placeholder="例：门诊 A"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              采样日期
            </label>
            <input
              type="date"
              name="collection_date"
              value={form.collection_date}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              送检日期
            </label>
            <input
              type="date"
              name="submission_date"
              value={form.submission_date}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '创建中...' : '创建样本'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-gray-600 text-sm px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}
