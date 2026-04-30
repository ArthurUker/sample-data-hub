import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import VersionTimeline from './version-timeline'
import ComparisonTable from './comparison-table'
import ReviewSection from './review-section'

export default async function SampleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: sample }, { data: profile }] = await Promise.all([
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
      .single(),
    supabase.from('profiles').select('role').single(),
  ])

  if (!sample) notFound()

  const versions = (sample.versions ?? []).sort(
    (a: { created_at: string }, b: { created_at: string }) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
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

  const canEdit =
    profile?.role === 'ADMIN' || profile?.role === 'OPERATOR'
  const canReview =
    profile?.role === 'ADMIN' || profile?.role === 'REVIEWER'

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/samples" className="text-sm text-gray-400 hover:text-gray-600">
              ← 样本台账
            </Link>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 font-mono">{sample.id}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">{sample.sample_type}</span>
            {sample.sample_source && (
              <span className="text-sm text-gray-400">来源：{sample.sample_source}</span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                statusColor[sample.status] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {statusLabel[sample.status] ?? sample.status}
            </span>
          </div>
        </div>
        {canEdit && (
          <Link
            href={`/samples/${id}/edit`}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 新增检测记录
          </Link>
        )}
      </div>

      {/* 基本信息 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-gray-400 mb-0.5">采样日期</div>
          <div className="text-gray-900">{sample.collection_date ?? '-'}</div>
        </div>
        <div>
          <div className="text-gray-400 mb-0.5">送检日期</div>
          <div className="text-gray-900">{sample.submission_date ?? '-'}</div>
        </div>
        <div>
          <div className="text-gray-400 mb-0.5">创建时间</div>
          <div className="text-gray-900">
            {new Date(sample.created_at).toLocaleDateString('zh-CN')}
          </div>
        </div>
        <div>
          <div className="text-gray-400 mb-0.5">最终版本</div>
          <div className="text-gray-900">
            {sample.final_version_id ? (
              <span className="font-mono text-green-700">
                {versions.find((v: { id: string }) => v.id === sample.final_version_id)
                  ? `v${(versions.find((v: { id: string }) => v.id === sample.final_version_id) as { version_no: number }).version_no}`
                  : '已设定'}
              </span>
            ) : (
              '-'
            )}
          </div>
        </div>
      </div>

      {/* 比对结果 */}
      <ComparisonTable
        comparisons={sample.comparison_results ?? []}
      />

      {/* 版本时间线 */}
      <VersionTimeline versions={versions} finalVersionId={sample.final_version_id} />

      {/* 审核区域 */}
      {canReview && (
        <ReviewSection
          sampleId={id}
          versions={versions}
          reviews={sample.reviews ?? []}
        />
      )}
    </div>
  )
}
