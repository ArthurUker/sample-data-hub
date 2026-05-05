import * as XLSX from 'xlsx'
import type { ExcelImportRow } from '@/types'

// 标准导入模板列定义（顺序固定）
export const IMPORT_COLUMNS = [
  '样本编号',
  '样本类型',
  '站点名称',
  '检测项目',
  'Ct值',
  '原始文本',
  '结论',
  '备注',
]

const COLUMN_ALIASES = {
  sample_id: ['样本编号', '检测编号', '样品编号', '样本id', '检测id'],
  sample_type: ['样本类型', '检测类别', '样品类型'],
  site_name: ['站点名称', '检测站点', '检测点位', '检测站点/点位'],
  project_name: ['检测项目', '项目名称', '项目'],
  ct_value: ['Ct值', 'CT值', '检测结果/CT值', '检测结果', '结果/CT值'],
  raw_text: ['原始文本', '原始结果'],
  conclusion: ['结论', '判定'],
  remark: ['备注', '说明', '检测时间'],
} as const

type ColumnKey = keyof typeof COLUMN_ALIASES

function normalizeHeader(input: string): string {
  return input.replace(/\s+/g, '').toLowerCase()
}

function getCellByAliases(row: Record<string, unknown>, key: ColumnKey): unknown {
  const aliases = COLUMN_ALIASES[key]
  const normalizedMap = new Map<string, unknown>()

  Object.entries(row).forEach(([k, v]) => {
    normalizedMap.set(normalizeHeader(k), v)
  })

  for (const alias of aliases) {
    const found = normalizedMap.get(normalizeHeader(alias))
    if (found !== undefined) return found
  }

  return ''
}

function isCtMissingText(v: string): boolean {
  const normalized = v.trim().toLowerCase()
  return ['未测', '未检', 'n/a', 'na', 'null', '-', '—', '/'].includes(normalized)
}

function parseCtValue(rawCt: string): {
  ctValue?: number
  isMissing: boolean
  rawTextFromCt?: string
  warning?: string
} {
  const input = rawCt.trim()
  if (!input) return { isMissing: true }
  if (isCtMissingText(input)) return { isMissing: true, rawTextFromCt: input }

  const matches = input.match(/-?\d+(?:\.\d+)?/g) ?? []
  if (matches.length === 0) {
    // 无法提取数值时按缺失处理，但保留原文以便手工核对
    return { isMissing: true, rawTextFromCt: input }
  }

  if (matches.length > 1) {
    return {
      ctValue: Number(matches[0]),
      isMissing: false,
      rawTextFromCt: input,
      warning: `检测结果 "${input}" 含多个 Ct 值，已按首个值 ${matches[0]} 导入并保留原文`,
    }
  }

  return { ctValue: Number(matches[0]), isMissing: false }
}

/**
 * 将 Excel 文件（ArrayBuffer）解析为行数据
 */
export function parseExcelFile(buffer: ArrayBuffer): {
  rows: ExcelImportRow[]
  errors: string[]
} {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  const errors: string[] = []
  const rows: ExcelImportRow[] = []
  const carry = {
    sample_id: '',
    sample_type: '',
    site_name: '',
    remark: '',
  }

  raw.forEach((row, idx) => {
    const lineNo = idx + 2 // Excel 行号（含表头）

    const sampleIdRaw = String(getCellByAliases(row, 'sample_id') ?? '').trim()
    const sampleTypeRaw = String(getCellByAliases(row, 'sample_type') ?? '').trim()
    const siteNameRaw = String(getCellByAliases(row, 'site_name') ?? '').trim()
    const projectName = String(getCellByAliases(row, 'project_name') ?? '').trim()
    const remarkRaw = String(getCellByAliases(row, 'remark') ?? '').trim()

    const sampleId = sampleIdRaw || carry.sample_id
    const sampleType = sampleTypeRaw || carry.sample_type
    const siteName = siteNameRaw || carry.site_name
    const remark = remarkRaw || carry.remark

    if (sampleIdRaw) carry.sample_id = sampleIdRaw
    if (sampleTypeRaw) carry.sample_type = sampleTypeRaw
    if (siteNameRaw) carry.site_name = siteNameRaw
    if (remarkRaw) carry.remark = remarkRaw

    if (!sampleId) {
      errors.push(`第 ${lineNo} 行：样本编号不能为空`)
      return
    }
    if (!sampleType) {
      errors.push(`第 ${lineNo} 行：样本类型不能为空`)
      return
    }
    if (!siteName) {
      errors.push(`第 ${lineNo} 行：站点名称不能为空`)
      return
    }
    if (!projectName) {
      errors.push(`第 ${lineNo} 行：检测项目不能为空`)
      return
    }

    const ctRaw = String(getCellByAliases(row, 'ct_value') ?? '').trim()
    const normalizedCt = parseCtValue(ctRaw)
    if (normalizedCt.warning) {
      errors.push(`第 ${lineNo} 行：${normalizedCt.warning}`)
    }

    const rawTextInput = String(getCellByAliases(row, 'raw_text') ?? '').trim()
    const rawText = rawTextInput || normalizedCt.rawTextFromCt || undefined

    rows.push({
      sample_id: sampleId,
      sample_type: sampleType,
      site_name: siteName,
      project_name: projectName,
      ct_value: normalizedCt.ctValue,
      is_missing: normalizedCt.isMissing,
      raw_text: rawText,
      conclusion: String(getCellByAliases(row, 'conclusion') ?? '').trim() || undefined,
      remark: remark || undefined,
    })
  })

  return { rows, errors }
}

/**
 * 生成导入模板 Excel 文件（ArrayBuffer）
 */
export function generateTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    IMPORT_COLUMNS,
    ['SMP-2024-001', '鼻咽拭子', '站点A', 'ORF1ab', '28.5', '', '阳性', ''],
    ['SMP-2024-001', '鼻咽拭子', '站点A', 'N基因', '29.1', '', '阳性', ''],
  ])
  XLSX.utils.book_append_sheet(wb, ws, '导入模板')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

/**
 * 将样本数据导出为 Excel（最终版快照）
 */
export function exportToExcel(
  rows: Array<{
    sample_id: string
    sample_type: string
    site_name: string
    project_name: string
    ct_value: number | null
    raw_text: string | null
    conclusion: string | null
    version_no: number
    is_final: boolean
  }>
): Uint8Array {
  const wb = XLSX.utils.book_new()
  const data = [
    ['样本编号', '样本类型', '站点', '检测项目', 'Ct值', '原始文本', '结论', '版本号', '是否最终版'],
    ...rows.map((r) => [
      r.sample_id,
      r.sample_type,
      r.site_name,
      r.project_name,
      r.ct_value ?? '',
      r.raw_text ?? '',
      r.conclusion ?? '',
      r.version_no,
      r.is_final ? '是' : '否',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, '导出数据')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}
