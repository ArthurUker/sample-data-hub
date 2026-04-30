'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'

type ReviewSample = {
  id: string
  sample_type: string
  sample_source: string | null
  updated_at: string
  comparison_results: Array<{
    project_name: string
    ct_diff: number | null
    threshold: number
    comp_status: string
  }>
}

export default function ReviewPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const [samples, setSamples] = useState<ReviewSample[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (profile && profile.role !== 'ADMIN' && profile.role !== 'REVIEWER') {
      router.replace('/samples')
      return
    }
    const supabase = createClient()
    supabase
      .from('samples')
      .select(
        `id, sample_type, sample_source, updated_at,
         comparison_results(project_name, ct_diff, threshold, comp_status)`,
        { count: 'exact' }
      )
      .eq('status', 'IN_REVIEW')
      .order('updated_at', { ascending: false })
      .then(({ data, count: total }) => {
        setSamples((data ?? []) as ReviewSample[])
        setCount(total ?? 0)
        setLoading(false)
      })
  }, [profile, authLoading, router])

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        加载中...
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">差异审核</h1>
        <p className="text-sm text-gray-500 mt-0.5">共 {count} 个样本待审核</p>
      </div>

      {samples.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">暂无需要审核的样本</p>
          <Link
            href="/samples"
            className="text-blue-600 text-sm mt-2 inline-block hover:underline"
          >
            返回样本台账
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {samples.map((sample) => {
            const divergentProjects = sample.comparison_results?.filter(
              (r) => r.comp_status === 'DIVERGENT'
            ) ?? []

            return (
              <div
                key={sample.id}
                className="bg-white rounded-xl border border-red-200 p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-semibold text-gray-900">
                        {sample.id}
                      </span>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        {divergentProjects.length} 项差异
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {sample.sample_type}
                      {sample.sample_source ? ` · ${sample.sample_source}` : ''}
                      {' · 更新于 '}
                      {new Date(sample.updated_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <Link
                    href={`/samples/detail?id=${sample.id}`}
                    className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    进入审核
                  </Link>
                </div>

                {divergentProjects.length > 0 && (
                  <div className="mt-3 rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">差异项目</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">差值</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">阈值</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">超出</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {divergentProjects.map((p) => (
                          <tr key={p.project_name}>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {p.project_name}
                            </td>
                            <td className="px-3 py-2 font-mono text-red-700">
                              {p.ct_diff?.toFixed(2) ?? '-'}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-500">
                              {p.threshold}
                            </td>
                            <td className="px-3 py-2 font-mono text-red-600">
                              {p.ct_diff !== null
                                ? `+${(p.ct_diff - p.threshold).toFixed(2)}`
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
