import type { Database } from './database.types'

// 表行类型别名
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Site = Database['public']['Tables']['sites']['Row']
export type Sample = Database['public']['Tables']['samples']['Row']
export type DetectionRecord = Database['public']['Tables']['detection_records']['Row']
export type DetectionItem = Database['public']['Tables']['detection_items']['Row']
export type Version = Database['public']['Tables']['versions']['Row']
export type VersionSnapshot = Database['public']['Tables']['version_snapshots']['Row']
export type ComparisonResult = Database['public']['Tables']['comparison_results']['Row']
export type Review = Database['public']['Tables']['reviews']['Row']
export type SystemConfig = Database['public']['Tables']['system_config']['Row']
export type AuditLog = Database['public']['Tables']['audit_logs']['Row']

// 枚举类型
export type UserRole = Database['public']['Enums']['user_role']
export type SampleStatus = Database['public']['Enums']['sample_status']
export type SourceType = Database['public']['Enums']['source_type']
export type VersionAction = Database['public']['Enums']['version_action']
export type CompStatus = Database['public']['Enums']['comp_status']
export type ReviewConclusion = Database['public']['Enums']['review_conclusion']

// 业务复合类型
export type SampleWithStatus = Sample & {
  divergent_count?: number
  latest_version?: Version
}

export type VersionWithSnapshot = Version & {
  version_snapshots: VersionSnapshot[]
  operator?: Profile
}

export type DetectionRecordWithItems = DetectionRecord & {
  detection_items: DetectionItem[]
  site?: Site
  operator?: Profile
}

export type SampleDetail = Sample & {
  detection_records: DetectionRecordWithItems[]
  versions: VersionWithSnapshot[]
  comparison_results: ComparisonResult[]
  reviews: Review[]
  final_version?: VersionWithSnapshot
}

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
