'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Version = {
  id: string
  version_no: number
  is_latest: boolean
  created_at: string
  profiles: { name: string } | null
}

type Review = {
  id: string
  conclusion: string
  remark: string | null
  created_at: string
  selected_version_id: string
  is_effective?: boolean | null
  profiles: { name: string } | null
}

export default function ReviewSection({
  sampleId,
  versions,
  reviews,
}: {
  sampleId: string
  versions: Version[]
  reviews: Review[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [selectedVersionId, setSelectedVersionId] = useState(
    versions.find((v) => v.is_latest)?.id ?? ''
  )
  const [conclusion, setConclusion] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED')
  const [remark, setRemark] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('请先登录')
      setLoading(false)
      return
    }

    // 写入审核记录
    const { error: reviewError } = await supabase.from('reviews').insert({
      sample_id: sampleId,
      reviewer_id: user.id,
      selected_version_id: selectedVersionId,
      conclusion,
      remark: remark || null,
    })

    if (reviewError) {
      setError(reviewError.message)
      setLoading(false)
      return
    }

    if (conclusion === 'ACCEPTED') {
      // 更新样本的最终版本和状态
      await supabase
        .from('samples')
        .update({
          final_version_id: selectedVersionId,
          status: 'FINALIZED',
        })
        .eq('id', sampleId)

      // 将选定版本标记为最终版
      await supabase
        .from('versions')
        .update({ is_final: true })
        .eq('id', selectedVersionId)
    }

    router.refresh()
    setLoading(false)
    setRemark('')
  }

  const effectiveReviews = reviews.filter((r) => r.is_effective !== false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-medium text-gray-900 mb-4">审核定版</h2>

      {/* 历史审核记录 */}
      {effectiveReviews.length > 0 && (
        <div className="mb-5 space-y-3">
          {effectiveReviews.map((review) => (
            <div
              key={review.id}
              className={`rounded-lg p-3 text-sm border ${
                review.conclusion === 'ACCEPTED'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-orange-50 border-orange-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">
                  {review.conclusion === 'ACCEPTED' ? '✓ 已定版' : '✗ 已驳回'}
                </span>
                <span className="text-gray-500">
                  选定 v{versions.find((v) => v.id === review.selected_version_id)?.version_no ?? '?'}
                </span>
                <span className="text-gray-400 ml-auto text-xs">
                  {review.profiles?.name ?? '未知'} ·{' '}
                  {new Date(review.created_at).toLocaleString('zh-CN')}
                </span>
              </div>
              {review.remark && (
                <p className="text-gray-600">{review.remark}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 提交审核表单 */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            选定版本
          </label>
          <select
            value={selectedVersionId}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version_no} — {v.profiles?.name ?? '未知'} ·{' '}
                {new Date(v.created_at).toLocaleDateString('zh-CN')}
                {v.is_latest ? ' (最新)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="conclusion"
              value="ACCEPTED"
              checked={conclusion === 'ACCEPTED'}
              onChange={() => setConclusion('ACCEPTED')}
              className="accent-green-600"
            />
            <span className="text-green-700 font-medium">接受并定版</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="conclusion"
              value="REJECTED"
              checked={conclusion === 'REJECTED'}
              onChange={() => setConclusion('REJECTED')}
              className="accent-orange-500"
            />
            <span className="text-orange-700 font-medium">驳回，需重新录入</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            审核意见
          </label>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={3}
            placeholder="可选，填写审核意见..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading || !selectedVersionId}
          className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '提交中...' : '提交审核'}
        </button>
      </form>
    </div>
  )
}
