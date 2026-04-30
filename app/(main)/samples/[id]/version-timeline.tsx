'use client'

const actionLabel: Record<string, string> = {
  CREATE: '新建',
  EDIT: '修改',
  IMPORT: '导入',
}

type Snapshot = {
  project_name: string
  ct_value: number | null
  raw_text: string | null
  conclusion: string | null
  is_missing: boolean
}

type Version = {
  id: string
  version_no: number
  action_type: string
  is_latest: boolean
  is_final: boolean
  note: string | null
  created_at: string
  record_id: string
  profiles: { name: string } | null
  version_snapshots: Snapshot[]
}

export default function VersionTimeline({
  versions,
  finalVersionId,
}: {
  versions: Version[]
  finalVersionId: string | null
}) {
  if (versions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
        暂无版本记录
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-medium text-gray-900 mb-4">版本历史</h2>
      <div className="space-y-4">
        {versions.map((version) => (
          <div key={version.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                  version.id === finalVersionId
                    ? 'bg-green-500'
                    : version.is_latest
                    ? 'bg-blue-500'
                    : 'bg-gray-300'
                }`}
              />
              <div className="w-px flex-1 bg-gray-200 mt-1" />
            </div>
            <div className="pb-4 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">
                  v{version.version_no}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {actionLabel[version.action_type] ?? version.action_type}
                </span>
                {version.id === finalVersionId && (
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                    最终版
                  </span>
                )}
                {version.is_latest && version.id !== finalVersionId && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    最新
                  </span>
                )}
                <span className="text-xs text-gray-400 ml-auto">
                  {version.profiles?.name ?? '未知'} ·{' '}
                  {new Date(version.created_at).toLocaleString('zh-CN')}
                </span>
              </div>
              {version.note && (
                <p className="text-xs text-gray-500 mb-2">{version.note}</p>
              )}
              {/* 快照明细 */}
              {version.version_snapshots.length > 0 && (
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  <table className="text-xs w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">项目</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Ct 值</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">原始值</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">结论</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {version.version_snapshots.map((snap, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-1.5 text-gray-700">{snap.project_name}</td>
                          <td className="px-3 py-1.5 text-gray-700 font-mono">
                            {snap.is_missing ? (
                              <span className="text-orange-500">缺失</span>
                            ) : snap.ct_value !== null ? (
                              snap.ct_value
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-gray-500">{snap.raw_text ?? '-'}</td>
                          <td className="px-3 py-1.5 text-gray-700">{snap.conclusion ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
