import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import SamplesFilter from './samples-filter'

type SearchParams = {
  q?: string
  status?: string
  comp?: string
  page?: string
}

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const page = Number(params.page ?? 1)
  const pageSize = 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('samples')
    .select(
      `id, sample_type, sample_source, status, final_version_id, created_at, updated_at,
       comparison_results(comp_status)`,
      { count: 'exact' }
    )
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (params.q) {
    query = query.ilike('id', `%${params.q}%`)
  }
  if (params.status) {
    query = query.eq('status', params.status)
  }

  const { data: samples, count } = await query

  // 过滤比对状态（前端过滤，数量有限时可用）
  let filtered = samples ?? []
  if (params.comp === 'divergent') {
    filtered = filtered.filter((s) =>
      (s.comparison_results as Array<{ comp_status: string }>)?.some(
        (r) => r.comp_status === 'DIVERGENT'
      )
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .single()

  const canCreate =
    profile?.role === 'ADMIN' || profile?.role === 'OPERATOR'

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

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">样本台账</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {count ?? 0} 条样本</p>
        </div>
        {canCreate && (
          <Link
            href="/samples/new"
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 新建样本
          </Link>
        )}
      </div>

      <SamplesFilter initialParams={params} />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">样本编号</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">样本类型</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">来源</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">状态</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">比对</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">更新时间</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  暂无样本数据
                </td>
              </tr>
            )}
            {filtered.map((sample) => {
              const compResults = sample.comparison_results as Array<{
                comp_status: string
              }>
              const hasDivergent = compResults?.some(
                (r) => r.comp_status === 'DIVERGENT'
              )
              const hasMissing = compResults?.some(
                (r) => r.comp_status === 'MISSING_DATA'
              )

              return (
                <tr key={sample.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">
                    {sample.id}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{sample.sample_type}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {sample.sample_source ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        statusColor[sample.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {statusLabel[sample.status] ?? sample.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {hasDivergent ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        有差异
                      </span>
                    ) : hasMissing ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                        缺失
                      </span>
                    ) : compResults?.length > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        一致
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(sample.updated_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/samples/${sample.id}`}
                      className="text-blue-600 hover:text-blue-800 text-xs"
                    >
                      查看
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/samples?page=${p}${params.q ? `&q=${params.q}` : ''}${params.status ? `&status=${params.status}` : ''}`}
              className={`px-3 py-1 text-sm rounded-md border ${
                p === page
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
