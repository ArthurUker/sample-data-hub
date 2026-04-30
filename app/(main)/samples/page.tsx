'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import SamplesFilter from './samples-filter'

type SampleRow = {
  id: string
  sample_type: string
  sample_source: string | null
  status: string
  updated_at: string
  comparison_results: Array<{ comp_status: string }>
}

export default function SamplesPage() {
  const searchParams = useSearchParams()
  const { profile } = useAuth()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const comp = searchParams.get('comp') ?? ''
  const page = Number(searchParams.get('page') ?? 1)
  const pageSize = 20

  const [samples, setSamples] = useState<SampleRow[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchSamples = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('samples')
      .select(
        `id, sample_type, sample_source, status, updated_at, comparison_results(comp_status)`,
        { count: 'exact' }
      )
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (q) query = query.ilike('id', `%${q}%`)
    if (status) query = query.eq('status', status)

    const { data, count: total } = await query
    let rows = (data ?? []) as SampleRow[]
    if (comp === 'divergent') {
      rows = rows.filter((s) =>
        s.comparison_results?.some((r) => r.comp_status === 'DIVERGENT')
      )
    }
    setSamples(rows)
    setCount(total ?? 0)
    setLoading(false)
  }, [q, status, comp, page, pageSize])

  useEffect(() => {
    fetchSamples()
  }, [fetchSamples])

  const canCreate = profile?.role === 'ADMIN' || profile?.role === 'OPERATOR'

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

  const totalPages = Math.ceil(count / pageSize)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">样本台账</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {count} 条样本</p>
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

      <SamplesFilter initialParams={{ q, status, comp }} />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">加载中...</div>
        ) : (
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
              {samples.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    暂无样本数据
                  </td>
                </tr>
              )}
              {samples.map((sample) => {
                const hasDivergent = sample.comparison_results?.some(
                  (r) => r.comp_status === 'DIVERGENT'
                )
                const hasMissing = sample.comparison_results?.some(
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
                      ) : sample.comparison_results?.length > 0 ? (
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
                        href={`/samples/detail?id=${sample.id}`}
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
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/samples?page=${p}${q ? `&q=${q}` : ''}${status ? `&status=${status}` : ''}`}
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
