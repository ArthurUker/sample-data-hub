'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import VersionTimeline from '../[id]/version-timeline'
import ComparisonTable from '../[id]/comparison-table'
import ReviewSection from '../[id]/review-section'

export default function SampleDetailClient() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id') ?? ''
  const router = useRouter()
  const { profile } = useAuth()
  const [sample, setSample] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const supabase = createClient()
    supabase
      .from('samples')
      .select(
        `*,
         detection_records(
           id, site_id, source_type, remark, created_at, operator_id,
           sites(name),
           profiles!detection_records_operator_id_fkey(name),
           detection_items(*)
         ),
         versions(
           id, version_no, action_type, is_latest, is_final, note, created_at, record_id, operator_id,
           profiles!versions_operator_id_fkey(name),
           version_snapshots(*)
         ),
         comparison_results(*),
         reviews(
           id, conclusion, remark, is_effective, created_at, selected_version_id, reviewer_id,
           profiles!reviews_reviewer_id_fkey(name)
         )`
      )
      .eq('id', id)
      .single()
      .then(({ data }: { data: Record<string, unknown> | null; error: unknown }) => {
        if (!data) router.replace('/samples')
        setSample(data)
        setLoading(false)
      })
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        加载中...
      </div>
    )
  }

  if (!sample) return null

  const versions = ((sample.versions ?? []) as Array<{ id: string; version_no: number; created_at: string }>).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const statusLabel: Record<string, string> = {
    PENDING: '待处理',
    IN_REVIEW: '审核中',
    FINALIZED: '已定版',
  }
  const statusColor: Record<string, string> = {
    PENDING: 'bg-gray-100 text-gray-600',
    IN_REVIEW: 'bg-yellow-100 text-yellow-700',
    FINALIZED: 'bg-green-100 text-green-700',
  }

  const status = sample.status as string
  const canEdit = profile?.role === 'ADMIN' || profile?.role === 'OPERATOR'
  const canReview = profile?.role === 'ADMIN' || profile?.role === 'REVIEWER'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/samples" className="text-sm text-gray-400 hover:text-gray-600">
              ← 样本台账
            </Link>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 font-mono">{sample.id as string}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">{sample.sample_type as string}</span>
            {!!sample.sample_source && (
              <span className="text-sm text-gray-400">来源：{sample.sample_source as string}</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[status] ?? 'bg-gray-100 text-gray-600'}`}>
              {statusLabel[status] ?? status}
            </span>
          </div>
        </div>
        {canEdit && (
          <Link
            href={`/samples/edit?id=${id}`}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 新增检测记录
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-gray-400 mb-0.5">采样日期</div>
          <div className="text-gray-900">{(sample.collection_date as string) ?? '-'}</div>
        </div>
        <div>
          <div className="text-gray-400 mb-0.5">送检日期</div>
          <div className="text-gray-900">{(sample.submission_date as string) ?? '-'}</div>
        </div>
        <div>
          <div className="text-gray-400 mb-0.5">创建时间</div>
          <div className="text-gray-900">
            {new Date(sample.created_at as string).toLocaleDateString('zh-CN')}
          </div>
        </div>
        <div>
          <div className="text-gray-400 mb-0.5">最终版本</div>
          <div className="text-gray-900">
            {sample.final_version_id ? (
              <span className="font-mono text-green-700">
                {versions.find((v) => v.id === sample.final_version_id)
                  ? `v${versions.find((v) => v.id === sample.final_version_id)!.version_no}`
                  : '已设定'}
              </span>
            ) : (
              '-'
            )}
          </div>
        </div>
      </div>

      <ComparisonTable comparisons={(sample.comparison_results ?? []) as []} />
      <VersionTimeline versions={versions as []} finalVersionId={sample.final_version_id as string | null} />
      {canReview && (
        <ReviewSection
          sampleId={id}
          versions={versions as []}
          reviews={(sample.reviews ?? []) as []}
        />
      )}
    </div>
  )
}
