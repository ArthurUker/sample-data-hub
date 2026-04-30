import * as XLSX from 'xlsx'
import type { ExcelImportRow } from './types'

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

  raw.forEach((row, idx) => {
    const lineNo = idx + 2

    const sampleId = String(row['样本编号'] ?? '').trim()
    const sampleType = String(row['样本类型'] ?? '').trim()
    const siteName = String(row['站点名称'] ?? '').trim()
    const projectName = String(row['检测项目'] ?? '').trim()

    if (!sampleId) { errors.push(`第 ${lineNo} 行：样本编号不能为空`); return }
    if (!sampleType) { errors.push(`第 ${lineNo} 行：样本类型不能为空`); return }
    if (!siteName) { errors.push(`第 ${lineNo} 行：站点名称不能为空`); return }
    if (!projectName) { errors.push(`第 ${lineNo} 行：检测项目不能为空`); return }

    const ctRaw = String(row['Ct值'] ?? '').trim()
    const ctValue = ctRaw !== '' ? parseFloat(ctRaw) : undefined

    rows.push({
      sample_id: sampleId,
      sample_type: sampleType,
      site_name: siteName,
      project_name: projectName,
      ct_value: isNaN(ctValue as number) ? ctRaw : ctValue,
      raw_text: String(row['原始文本'] ?? '').trim() || undefined,
      conclusion: String(row['结论'] ?? '').trim() || undefined,
      remark: String(row['备注'] ?? '').trim() || undefined,
    })
  })

  return { rows, errors }
}

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
