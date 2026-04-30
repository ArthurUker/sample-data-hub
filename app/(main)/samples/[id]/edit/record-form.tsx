'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Site = { id: string; name: string }

type DetectionItemInput = {
  project_name: string
  ct_value: string
  raw_text: string
  conclusion: string
  is_missing: boolean
}

const defaultItem = (): DetectionItemInput => ({
  project_name: '',
  ct_value: '',
  raw_text: '',
  conclusion: '',
  is_missing: false,
})

export default function RecordForm({
  sampleId,
  sites,
  operatorId,
}: {
  sampleId: string
  sites: Site[]
  operatorId: string
}) {
  const router = useRouter()
  const supabase = createClient()

  const [siteId, setSiteId] = useState(sites[0]?.id ?? '')
  const [remark, setRemark] = useState('')
  const [items, setItems] = useState<DetectionItemInput[]>([defaultItem()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateItem(index: number, field: keyof DetectionItemInput, value: string | boolean) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }

  function addItem() {
    setItems((prev) => [...prev, defaultItem()])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (!siteId) {
      setError('请选择站点')
      setLoading(false)
      return
    }

    const validItems = items.filter((item) => item.project_name.trim())
    if (validItems.length === 0) {
      setError('请至少填写一个检测项目')
      setLoading(false)
      return
    }

    // 1. 创建检测记录
    const { data: record, error: recordError } = await supabase
      .from('detection_records')
      .insert({
        sample_id: sampleId,
        site_id: siteId,
        source_type: 'MANUAL',
        operator_id: operatorId,
        remark: remark || null,
      })
      .select('id')
      .single()

    if (recordError || !record) {
      setError(recordError?.message ?? '创建检测记录失败')
      setLoading(false)
      return
    }

    // 2. 写入检测项目明细
    const itemsToInsert = validItems.map((item) => ({
      record_id: record.id,
      project_name: item.project_name.trim(),
      ct_value: item.is_missing ? null : (parseFloat(item.ct_value) || null),
      raw_text: item.raw_text || null,
      conclusion: item.conclusion || null,
      is_missing: item.is_missing,
    }))

    const { error: itemsError } = await supabase
      .from('detection_items')
      .insert(itemsToInsert)

    if (itemsError) {
      setError(itemsError.message)
      setLoading(false)
      return
    }

    // 3. 计算该 record 下的 version_no（该 record 的第一版）
    const { data: existingVersions } = await supabase
      .from('versions')
      .select('version_no')
      .eq('record_id', record.id)
      .order('version_no', { ascending: false })
      .limit(1)

    const newVersionNo = (existingVersions?.[0]?.version_no ?? 0) + 1

    // 4. 将同一 record 的旧版本 is_latest 设为 false
    await supabase
      .from('versions')
      .update({ is_latest: false })
      .eq('record_id', record.id)
      .eq('is_latest', true)

    // 5. 创建新版本
    const { data: version, error: versionError } = await supabase
      .from('versions')
      .insert({
        sample_id: sampleId,
        record_id: record.id,
        version_no: newVersionNo,
        action_type: 'CREATE',
        operator_id: operatorId,
        note: remark || null,
        is_latest: true,
        is_final: false,
      })
      .select('id')
      .single()

    if (versionError || !version) {
      setError(versionError?.message ?? '创建版本失败')
      setLoading(false)
      return
    }

    // 6. 写入版本快照
    const snapshots = itemsToInsert.map((item) => ({
      version_id: version.id,
      project_name: item.project_name,
      ct_value: item.ct_value,
      raw_text: item.raw_text,
      conclusion: item.conclusion,
      is_missing: item.is_missing,
    }))

    await supabase.from('version_snapshots').insert(snapshots)

    // 7. 触发比对计算（调用 API Route）
    await fetch(`/api/samples/${sampleId}/compare`, { method: 'POST' })

    router.push(`/samples/${sampleId}`)
    router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 p-6 space-y-6"
    >
      {/* 站点选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          检测站点 <span className="text-red-500">*</span>
        </label>
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </div>

      {/* 备注 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
        <input
          type="text"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="可选"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 检测项目明细 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700">
            检测项目 <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={addItem}
            className="text-blue-600 text-xs hover:underline"
          >
            + 添加项目
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-12 gap-2 items-start border border-gray-100 rounded-lg p-3 bg-gray-50"
            >
              <div className="col-span-3">
                <input
                  type="text"
                  value={item.project_name}
                  onChange={(e) => updateItem(index, 'project_name', e.target.value)}
                  placeholder="项目名称"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.ct_value}
                  onChange={(e) => updateItem(index, 'ct_value', e.target.value)}
                  placeholder="Ct 值"
                  disabled={item.is_missing}
                  step="0.01"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-200"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="text"
                  value={item.raw_text}
                  onChange={(e) => updateItem(index, 'raw_text', e.target.value)}
                  placeholder="原始文本"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="text"
                  value={item.conclusion}
                  onChange={(e) => updateItem(index, 'conclusion', e.target.value)}
                  placeholder="结论"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2 flex items-center gap-1.5 pt-1.5">
                <input
                  type="checkbox"
                  id={`missing-${index}`}
                  checked={item.is_missing}
                  onChange={(e) => updateItem(index, 'is_missing', e.target.checked)}
                  className="accent-orange-500"
                />
                <label htmlFor={`missing-${index}`} className="text-xs text-gray-500">
                  缺失
                </label>
              </div>
              <div className="col-span-1 flex justify-end">
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          项目名称、Ct 值、原始文本、结论；勾选&quot;缺失&quot;表示该项无数据
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '提交中...' : '提交检测记录'}
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
  )
}
