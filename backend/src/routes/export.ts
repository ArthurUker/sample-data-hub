import { Router, Response } from 'express'
import { AuthenticatedRequest, requireAuth } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { exportToExcel, generateTemplate } from '../lib/excel'

const router = Router()

/**
 * GET /api/export/template
 * Download blank import template (no auth required for convenience)
 */
router.get('/template', (_req, res: Response) => {
  const buffer = generateTemplate()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="import_template.xlsx"')
  res.send(Buffer.from(buffer))
})

/**
 * GET /api/export?sampleIds=id1,id2,...
 * Export samples to Excel. Optionally filter by comma-separated sampleIds.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawIds = req.query.sampleIds as string | undefined
    const sampleIds = rawIds ? rawIds.split(',').map((s) => s.trim()).filter(Boolean) : null

    // Build query: join version_snapshots → versions (final) → samples → sites
    let query = supabaseAdmin
      .from('version_snapshots')
      .select(
        `project_name, ct_value, raw_text, conclusion,
         versions!inner(version_no, sample_id,
           samples!inner(id, sample_type, final_version_id, sites(name))
         )`
      )

    if (sampleIds?.length) {
      query = query.in('versions.sample_id', sampleIds)
    }

    const { data, error } = await query

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    type SnapshotRow = {
      project_name: string
      ct_value: number | null
      raw_text: string | null
      conclusion: string | null
      versions: {
        version_no: number
        sample_id: string
        samples: {
          id: string
          sample_type: string
          final_version_id: string | null
          sites: { name: string } | null
        }
      }
    }

    const rows = ((data ?? []) as unknown as SnapshotRow[]).map((snap) => {
      const ver = snap.versions
      const sample = ver.samples
      return {
        sample_id: sample.id,
        sample_type: sample.sample_type,
        site_name: sample.sites?.name ?? '',
        project_name: snap.project_name,
        ct_value: snap.ct_value,
        raw_text: snap.raw_text,
        conclusion: snap.conclusion,
        version_no: ver.version_no,
        is_final: sample.final_version_id != null,
      }
    })

    const buffer = exportToExcel(rows)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="samples_export.xlsx"')
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('[export] unexpected error', err)
    res.status(500).json({ error: 'Export failed' })
  }
})

export default router
