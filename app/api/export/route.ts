import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { exportToExcel, generateTemplate } from '@/lib/excel'

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(arrayBuffer).set(bytes)
  return arrayBuffer
}

// 下载导入模板
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const isTemplate = searchParams.get('template') === '1'

  if (isTemplate || request.nextUrl.pathname.endsWith('/template')) {
    const buffer = generateTemplate()
    return new NextResponse(toArrayBuffer(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="import_template.xlsx"',
      },
    })
  }

  const supabase = await createClient()

  // 获取用户身份
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 解析 sampleIds 参数
  const sampleIdsParam = searchParams.get('sampleIds')
  const sampleIds = sampleIdsParam
    ? sampleIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null

  // 查询最终版本快照
  let versionsQuery = supabase
    .from('versions')
    .select(`
      id,
      version_no,
      is_final,
      sample_id,
      record_id,
      version_snapshots(project_name, ct_value, raw_text, conclusion),
      detection_records(
        site_id,
        sites(name)
      )
    `)
    .eq('is_latest', true)

  if (sampleIds && sampleIds.length > 0) {
    versionsQuery = versionsQuery.in('sample_id', sampleIds)
  }

  const { data: versions, error } = await versionsQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!versions || versions.length === 0) {
    return NextResponse.json({ error: '无数据可导出' }, { status: 404 })
  }

  // 获取样本类型
  const allSampleIds = [...new Set(versions.map((v) => v.sample_id))]
  const { data: samples } = await supabase
    .from('samples')
    .select('id, sample_type')
    .in('id', allSampleIds)

  const sampleTypeMap = new Map(samples?.map((s) => [s.id, s.sample_type]) ?? [])

  // 展平数据
  const rows: Parameters<typeof exportToExcel>[0] = []
  for (const version of versions) {
    const sampleType = sampleTypeMap.get(version.sample_id) ?? ''
    const detectionRecords = version.detection_records as
      | Array<{ site_id: string; sites: Array<{ name: string }> | { name: string } | null }>
      | { site_id: string; sites: Array<{ name: string }> | { name: string } | null }
      | null
    const record = Array.isArray(detectionRecords)
      ? detectionRecords[0]
      : detectionRecords
    const siteRelation = record?.sites
    const siteName = Array.isArray(siteRelation)
      ? (siteRelation[0]?.name ?? '')
      : (siteRelation?.name ?? '')

    const snapshots = (version.version_snapshots as Array<{
      project_name: string
      ct_value: number | null
      raw_text: string | null
      conclusion: string | null
    }>) ?? []

    for (const snap of snapshots) {
      rows.push({
        sample_id: version.sample_id,
        sample_type: sampleType,
        site_name: siteName,
        project_name: snap.project_name,
        ct_value: snap.ct_value,
        raw_text: snap.raw_text,
        conclusion: snap.conclusion,
        version_no: version.version_no,
        is_final: version.is_final,
      })
    }
  }

  const buffer = exportToExcel(rows)
  const filename = `export_${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(toArrayBuffer(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
