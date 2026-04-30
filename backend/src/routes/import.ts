import { Router, Response } from 'express'
import multer from 'multer'
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { parseExcelFile } from '../lib/excel'
import type { ExcelImportRow } from '../lib/types'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

/**
 * POST /api/import
 * Accept an Excel file and insert detection records + versions into Supabase.
 * Requires ADMIN or OPERATOR role.
 */
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const { rows, errors: parseErrors } = parseExcelFile(req.file.buffer.buffer as ArrayBuffer)

    if (parseErrors.length > 0 && rows.length === 0) {
      res.status(422).json({ imported: 0, errors: parseErrors })
      return
    }

    const operatorId = req.userId!
    const allErrors: string[] = [...parseErrors]
    let importedCount = 0

    // Group rows by sample
    const bySample = new Map<string, ExcelImportRow[]>()
    for (const row of rows) {
      if (!bySample.has(row.sample_id)) bySample.set(row.sample_id, [])
      bySample.get(row.sample_id)!.push(row)
    }

    for (const [sampleId, sampleRows] of bySample) {
      try {
        // Upsert sample
        const { data: existingSample } = await supabaseAdmin
          .from('samples')
          .select('id')
          .eq('id', sampleId)
          .maybeSingle()

        if (!existingSample) {
          const firstRow = sampleRows[0]
          if (!firstRow) { allErrors.push(`样本 ${sampleId} 无有效数据行`); continue }
          const { error: sampleError } = await supabaseAdmin.from('samples').insert({
            id: sampleId,
            sample_type: firstRow.sample_type,
          } as never)
          if (sampleError) throw new Error(`创建样本 ${sampleId} 失败: ${sampleError.message}`)
        }

        // Group by site
        const bySite = new Map<string, ExcelImportRow[]>()
        for (const row of sampleRows) {
          if (!bySite.has(row.site_name)) bySite.set(row.site_name, [])
          bySite.get(row.site_name)!.push(row)
        }

        for (const [siteName, siteRows] of bySite) {
          const { data: site } = await supabaseAdmin
            .from('sites')
            .select('id')
            .eq('name', siteName)
            .maybeSingle()

          if (!site) { allErrors.push(`站点"${siteName}"不存在，已跳过`); continue }

          // Create detection record
          const { data: record, error: recordError } = await supabaseAdmin
            .from('detection_records')
            .insert({
              sample_id: sampleId,
              site_id: site.id,
              source_type: 'IMPORT',
              operator_id: operatorId,
              remark: siteRows[0]?.remark ?? null,
            })
            .select('id')
            .single()

          if (recordError || !record) {
            allErrors.push(`样本 ${sampleId} 站点 ${siteName} 创建检测记录失败`)
            continue
          }

          // Create detection items
          const itemsToInsert = siteRows.map((row) => ({
            record_id: record.id,
            project_name: row.project_name,
            ct_value: typeof row.ct_value === 'number' ? row.ct_value : null,
            raw_text: row.raw_text ?? null,
            conclusion: row.conclusion ?? null,
            is_missing: row.ct_value === undefined || row.ct_value === '',
          }))

          const { error: itemsError } = await supabaseAdmin
            .from('detection_items')
            .insert(itemsToInsert)

          if (itemsError) {
            allErrors.push(`样本 ${sampleId} 检测项目写入失败: ${itemsError.message}`)
            continue
          }

          // Get next version number
          const { data: existingVersions } = await supabaseAdmin
            .from('versions')
            .select('version_no')
            .eq('sample_id', sampleId)
            .order('version_no', { ascending: false })
            .limit(1)

          const newVersionNo = (existingVersions?.[0]?.version_no ?? 0) + 1

          // Mark old versions as not latest
          await supabaseAdmin
            .from('versions')
            .update({ is_latest: false })
            .eq('sample_id', sampleId)
            .eq('is_latest', true)

          // Create version
          const { data: version, error: versionError } = await supabaseAdmin
            .from('versions')
            .insert({
              sample_id: sampleId,
              record_id: record.id,
              version_no: newVersionNo,
              action_type: 'CREATE',
              operator_id: operatorId,
              is_latest: true,
              is_final: false,
            })
            .select('id')
            .single()

          if (versionError || !version) {
            allErrors.push(`样本 ${sampleId} 版本创建失败`)
            continue
          }

          // Write version snapshots
          const snapshots = itemsToInsert.map((item) => ({
            version_id: version.id,
            project_name: item.project_name,
            ct_value: item.ct_value,
            raw_text: item.raw_text,
            is_missing: item.is_missing,
          }))

          await supabaseAdmin.from('version_snapshots').insert(snapshots)
          importedCount++
        }
      } catch (err) {
        allErrors.push(`样本 ${sampleId} 处理失败: ${(err as Error).message}`)
      }
    }

    res.json({ imported: importedCount, errors: allErrors })
  }
)

export default router
