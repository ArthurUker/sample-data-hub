'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseExcelFile } from '@/lib/excel'
import { triggerCompare } from '@/lib/api-client'
import type { ExcelImportRow } from '@/types'

type ImportStatus = 'idle' | 'parsing' | 'preview' | 'importing' | 'done'

export default function ImportClient() {
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const [status, setStatus] = useState<ImportStatus>('idle')
  const [rows, setRows] = useState<ExcelImportRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importedCount, setImportedCount] = useState(0)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('parsing')
    setParseErrors([])
    setRows([])

    const buffer = await file.arrayBuffer()
    const { rows: parsed, errors } = parseExcelFile(buffer)

    setParseErrors(errors)
    setRows(parsed)
    setStatus('preview')
  }

  async function handleImport() {
    if (rows.length === 0) return
    setStatus('importing')
    setImportErrors([])

    const errors: string[] = []

    // 获取当前操作员
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setImportErrors(['未登录'])
      setStatus('preview')
      return
    }

    // 按样本分组
    const bySample = new Map<string, ExcelImportRow[]>()
    for (const row of rows) {
      if (!bySample.has(row.sample_id)) bySample.set(row.sample_id, [])
      bySample.get(row.sample_id)!.push(row)
    }

    let imported = 0

    for (const [sampleId, sampleRows] of bySample) {
      try {
        // 确保样本存在（若不存在则创建）
        const { data: existingSample } = await supabase
          .from('samples')
          .select('id')
          .eq('id', sampleId)
          .maybeSingle()

        if (!existingSample) {
          const firstRow = sampleRows[0]
          if (!firstRow) {
            errors.push(`样本 ${sampleId} 无有效数据行`)
            continue
          }
          const { error: sampleError } = await supabase.from('samples').insert({
            id: sampleId,
            sample_type: firstRow.sample_type,
          } as never)
          if (sampleError) throw new Error(`创建样本 ${sampleId} 失败: ${sampleError.message}`)
        }

        // 按站点分组（每个站点一条检测记录）
        const bySite = new Map<string, ExcelImportRow[]>()
        for (const row of sampleRows) {
          const key = row.site_name
          if (!bySite.has(key)) bySite.set(key, [])
          bySite.get(key)!.push(row)
        }

        for (const [siteName, siteRows] of bySite) {
          // 查找站点 ID
          const { data: site } = await supabase
            .from('sites')
            .select('id')
            .eq('name', siteName)
            .maybeSingle()

          if (!site) {
            errors.push(`站点"${siteName}"不存在，已跳过`)
            continue
          }

          // 创建检测记录
          const { data: record, error: recordError } = await supabase
            .from('detection_records')
            .insert({
              sample_id: sampleId,
              site_id: site.id,
              source_type: 'IMPORT',
              operator_id: user.id,
              remark: siteRows[0].remark || null,
            })
            .select('id')
            .single()

          if (recordError || !record) {
            errors.push(`样本 ${sampleId} 站点 ${siteName} 创建检测记录失败`)
            continue
          }

          // 创建检测项目
          const itemsToInsert = siteRows.map((row) => ({
            record_id: record.id,
            project_name: row.project_name,
            ct_value: typeof row.ct_value === 'number' ? row.ct_value : null,
            raw_text: typeof row.raw_text === 'string' ? row.raw_text : null,
            conclusion: typeof row.conclusion === 'string' ? row.conclusion : null,
            is_missing: row.is_missing ?? row.ct_value === undefined,
          }))

          const { error: itemsError } = await supabase
            .from('detection_items')
            .insert(itemsToInsert)

          if (itemsError) {
            errors.push(`样本 ${sampleId} 检测项目写入失败: ${itemsError.message}`)
            continue
          }

          // 计算版本号
          const { data: existingVersions } = await supabase
            .from('versions')
            .select('version_no')
            .eq('record_id', record.id)
            .order('version_no', { ascending: false })
            .limit(1)

          const newVersionNo = (existingVersions?.[0]?.version_no ?? 0) + 1

          // 旧版本设为非最新
          await supabase
            .from('versions')
            .update({ is_latest: false })
            .eq('record_id', record.id)
            .eq('is_latest', true)

          // 创建版本
          const { data: version, error: versionError } = await supabase
            .from('versions')
            .insert({
              sample_id: sampleId,
              record_id: record.id,
              version_no: newVersionNo,
              action_type: 'CREATE',
              operator_id: user.id,
              is_latest: true,
              is_final: false,
            })
            .select('id')
            .single()

          if (versionError || !version) {
            errors.push(`样本 ${sampleId} 版本创建失败`)
            continue
          }

          // 写入版本快照
          const snapshots = itemsToInsert.map((item) => ({
            version_id: version.id,
            project_name: item.project_name,
            ct_value: item.ct_value,
            raw_text: item.raw_text,
            conclusion: item.conclusion,
            is_missing: item.is_missing,
          }))

          await supabase.from('version_snapshots').insert(snapshots)
        }

        // 触发比对计算
        await triggerCompare(sampleId)
        imported++
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `样本 ${sampleId} 导入失败`)
      }
    }

    setImportErrors(errors)
    setImportedCount(imported)
    setStatus('done')
  }

  function handleReset() {
    setStatus('idle')
    setRows([])
    setParseErrors([])
    setImportErrors([])
    setImportedCount(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      {/* 文件选择区域 */}
      {(status === 'idle' || status === 'parsing') && (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-10 text-center">
          <p className="text-gray-500 text-sm mb-4">选择 .xlsx 格式的 Excel 文件</p>
          <label className="cursor-pointer">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            <span className="bg-blue-600 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
              {status === 'parsing' ? '解析中...' : '选择文件'}
            </span>
          </label>
          <p className="text-xs text-gray-400 mt-3">
            支持模板表头或客户表头（如：检测编号、检测类别、检测站点、检测结果/CT值）
          </p>
        </div>
      )}

      {/* 解析错误提示 */}
      {parseErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-medium text-red-700 mb-2">文件中发现以下问题（有效行仍可继续导入）：</p>
          <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5">
            {parseErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* 预览表格 */}
      {(status === 'preview' || status === 'importing') && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              解析到 {rows.length} 行有效数据
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="text-gray-500 text-sm px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
              >
                重新选择
              </button>
              <button
                onClick={handleImport}
                disabled={status === 'importing'}
                className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {status === 'importing' ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {['样本编号', '样本类型', '站点', '检测项目', 'Ct值', '结论', '备注'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.slice(0, 100).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono">{row.sample_id}</td>
                    <td className="px-3 py-2">{row.sample_type}</td>
                    <td className="px-3 py-2">{row.site_name}</td>
                    <td className="px-3 py-2 font-medium">{row.project_name}</td>
                    <td className="px-3 py-2 font-mono">
                      {row.is_missing ? (row.raw_text ?? '未测') : String(row.ct_value ?? '')}
                    </td>
                    <td className="px-3 py-2">{row.conclusion ?? ''}</td>
                    <td className="px-3 py-2 text-gray-400">{row.remark ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && (
              <p className="text-xs text-gray-400 px-4 py-2">
                仅显示前 100 行，共 {rows.length} 行
              </p>
            )}
          </div>
        </div>
      )}

      {/* 导入结果 */}
      {status === 'done' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div
            className={`text-sm font-medium mb-3 ${
              importErrors.length === 0 ? 'text-green-700' : 'text-yellow-700'
            }`}
          >
            {importErrors.length === 0
              ? `✓ 成功导入 ${importedCount} 个样本`
              : `导入完成：${importedCount} 个样本成功，${importErrors.length} 个错误`}
          </div>
          {importErrors.length > 0 && (
            <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5 mb-4">
              {importErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
          <button
            onClick={handleReset}
            className="text-blue-600 text-sm hover:underline"
          >
            继续导入
          </button>
        </div>
      )}
    </div>
  )
}
