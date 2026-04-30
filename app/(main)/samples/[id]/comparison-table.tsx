'use client'

type ComparisonResult = {
  id: string
  project_name: string
  min_ct: number | null
  max_ct: number | null
  ct_diff: number | null
  threshold: number
  comp_status: string
  needs_review: boolean
  calculated_at: string
}

const statusConfig: Record<string, { label: string; color: string }> = {
  CONSISTENT: { label: '一致', color: 'text-green-700 bg-green-50' },
  DIVERGENT: { label: '差异', color: 'text-red-700 bg-red-50' },
  MISSING_DATA: { label: '数据缺失', color: 'text-orange-700 bg-orange-50' },
}

export default function ComparisonTable({
  comparisons,
}: {
  comparisons: ComparisonResult[]
}) {
  if (comparisons.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-medium text-gray-900 mb-2">比对结果</h2>
        <p className="text-sm text-gray-400">暂无比对数据，录入多站点检测记录后自动生成</p>
      </div>
    )
  }

  const hasDivergent = comparisons.some((c) => c.comp_status === 'DIVERGENT')

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium text-gray-900">比对结果</h2>
        {hasDivergent && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
            存在差异，需审核
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 rounded-lg">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600 rounded-l-lg">检测项目</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">最小 Ct</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">最大 Ct</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">差值</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">阈值</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600 rounded-r-lg">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {comparisons.map((c) => {
            const cfg = statusConfig[c.comp_status] ?? { label: c.comp_status, color: 'text-gray-600 bg-gray-50' }
            return (
              <tr
                key={c.id}
                className={c.comp_status === 'DIVERGENT' ? 'bg-red-50/30' : ''}
              >
                <td className="px-4 py-2.5 font-medium text-gray-900">{c.project_name}</td>
                <td className="px-4 py-2.5 font-mono text-gray-700">
                  {c.min_ct ?? '-'}
                </td>
                <td className="px-4 py-2.5 font-mono text-gray-700">
                  {c.max_ct ?? '-'}
                </td>
                <td className="px-4 py-2.5 font-mono">
                  {c.ct_diff !== null ? (
                    <span className={c.comp_status === 'DIVERGENT' ? 'text-red-700 font-semibold' : 'text-gray-700'}>
                      {c.ct_diff.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-gray-500">{c.threshold}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-2">
        最后计算于 {new Date(comparisons[0]?.calculated_at).toLocaleString('zh-CN')}
      </p>
    </div>
  )
}
