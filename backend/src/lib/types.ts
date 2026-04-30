// Excel 导入行类型
export type ExcelImportRow = {
  sample_id: string
  sample_type: string
  site_name: string
  project_name: string
  ct_value?: number | string
  raw_text?: string
  conclusion?: string
  remark?: string
}

// 比对计算输入
export type ComparisonInput = {
  sampleId: string
  projectName: string
  snapshots: Array<{
    versionId: string
    ctValue: number | null
    isMissing: boolean
  }>
  threshold: number
}

export type CompStatus = 'CONSISTENT' | 'DIVERGENT' | 'MISSING_DATA'
