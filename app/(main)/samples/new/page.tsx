'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewSamplePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    router.push(`/samples/${form.id}`)
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">新建样本</h1>
        <p className="text-sm text-gray-500 mt-0.5">样本编号全局唯一，创建后不可修改</p>
      </div>

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
