'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

type FilterParams = {
  q?: string
  status?: string
  comp?: string
}

export default function SamplesFilter({
  initialParams,
}: {
  initialParams: FilterParams
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      startTransition(() => {
        router.push(`/samples?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  return (
    <div className="flex flex-wrap gap-3 bg-white rounded-xl border border-gray-200 p-4">
      <input
        type="text"
        defaultValue={initialParams.q ?? ''}
        placeholder="搜索样本编号..."
        onChange={(e) => updateFilter('q', e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
      />

      <select
        defaultValue={initialParams.status ?? ''}
        onChange={(e) => updateFilter('status', e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">全部状态</option>
        <option value="PENDING">待处理</option>
        <option value="IN_REVIEW">审核中</option>
        <option value="FINALIZED">已定版</option>
      </select>

      <select
        defaultValue={initialParams.comp ?? ''}
        onChange={(e) => updateFilter('comp', e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">全部比对状态</option>
        <option value="divergent">有差异</option>
      </select>
    </div>
  )
}
