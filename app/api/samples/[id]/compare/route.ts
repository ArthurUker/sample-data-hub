import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { calculateAllComparisons } from '@/lib/comparison'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sampleId } = await params
  const supabase = await createClient()

  // 获取该样本下所有最新版本及其快照
  const { data: latestVersions, error } = await supabase
    .from('versions')
    .select('id, version_snapshots(project_name, ct_value, is_missing)')
    .eq('sample_id', sampleId)
    .eq('is_latest', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!latestVersions || latestVersions.length === 0) {
    return NextResponse.json({ message: 'no versions' })
  }

  // 获取当前阈值
  const { data: config } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'ct_diff_threshold')
    .single()

  const threshold = parseFloat(config?.value ?? '2')

  // 聚合快照数据
  const snapshotsByVersion = latestVersions.map((v) => ({
    versionId: v.id,
    snapshots: (v.version_snapshots as Array<{
      project_name: string
      ct_value: number | null
      is_missing: boolean
    }>).map((snap) => ({
      projectName: snap.project_name,
      ctValue: snap.ct_value,
      isMissing: snap.is_missing,
    })),
  }))

  const results = calculateAllComparisons(sampleId, snapshotsByVersion, threshold)

  // 更新 sample 状态
  const hasDivergent = results.some((r) => r.compStatus === 'DIVERGENT')

  // 获取当前样本状态，避免覆盖已定版状态（除非出现新差异）
  const { data: sample } = await supabase
    .from('samples')
    .select('status')
    .eq('id', sampleId)
    .single()

  const newStatus =
    hasDivergent
      ? 'IN_REVIEW'
      : sample?.status === 'FINALIZED'
      ? 'FINALIZED'
      : 'PENDING'

  // 批量 upsert 比对结果
  const upsertData = results.map((r) => ({
    sample_id: r.sampleId,
    project_name: r.projectName,
    version_ids: r.versionIds,
    min_ct: r.minCt,
    max_ct: r.maxCt,
    ct_diff: r.ctDiff,
    threshold: r.threshold,
    comp_status: r.compStatus,
    needs_review: r.needsReview,
    calculated_at: new Date().toISOString(),
  }))

  const { error: upsertError } = await supabase
    .from('comparison_results')
    .upsert(upsertData, { onConflict: 'sample_id,project_name' })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  // 更新样本状态（若有差异则进入审核中）
  await supabase
    .from('samples')
    .update({ status: newStatus })
    .eq('id', sampleId)

  return NextResponse.json({ success: true, results })
}
