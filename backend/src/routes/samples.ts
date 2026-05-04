import { Router, Response } from 'express'
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { calculateAllComparisons } from '../lib/comparison'

const router = Router()

/**
 * POST /api/samples/:id/compare
 * Recalculate comparison results for all latest-version snapshots of a sample.
 * Requires ADMIN/OPERATOR/REVIEWER role.
 */
router.post(
  '/:id/compare',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR', 'REVIEWER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const sampleId = req.params.id

    const { data: latestVersions, error } = await supabaseAdmin
      .from('versions')
      .select('id, version_snapshots(project_name, ct_value, is_missing)')
      .eq('sample_id', sampleId)
      .eq('is_latest', true)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    if (!latestVersions?.length) {
      res.json({ message: 'no versions' })
      return
    }

    const { data: config } = await supabaseAdmin
      .from('system_config')
      .select('value')
      .eq('key', 'ct_diff_threshold')
      .single()

    const threshold = parseFloat((config as { value?: string } | null)?.value ?? '2')

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
    const hasDivergent = results.some((r) => r.compStatus === 'DIVERGENT')

    const { data: sample } = await supabaseAdmin
      .from('samples')
      .select('status')
      .eq('id', sampleId)
      .single()

    const newStatus =
      hasDivergent
        ? 'IN_REVIEW'
        : (sample as { status?: string } | null)?.status === 'FINALIZED'
        ? 'FINALIZED'
        : 'PENDING'

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

    const { error: upsertError } = await supabaseAdmin
      .from('comparison_results')
      .upsert(upsertData, { onConflict: 'sample_id,project_name' })

    if (upsertError) {
      res.status(500).json({ error: upsertError.message })
      return
    }

    await supabaseAdmin.from('samples').update({ status: newStatus }).eq('id', sampleId)

    res.json({ success: true, results })
  }
)

export default router
