/**
 * Import - Excel 导入模块
 * 使用 SheetJS（window.XLSX）在前端解析，然后直接写入 Supabase
 */
import { getSupabase } from '../services/AuthService.js'
import { triggerCompare, downloadTemplate } from '../services/ApiService.js'
import { showToast } from '../app.js'

// 列别名映射（与 lib/excel.ts 保持一致）
const COL_ALIASES = {
  sample_id:    ['样本编号', '检测编号', '样品编号', '样本id', '检测id'],
  sample_type:  ['样本类型', '检测类别', '样品类型'],
  site_name:    ['站点名称', '检测站点', '检测点位', '检测站点/点位', '检测方式'],
  project_name: ['检测项目', '项目名称', '项目'],
  ct_value:     ['Ct值', 'CT值', '检测结果/CT值', '检测结果', '结果/CT值'],
  raw_text:     ['原始文本', '原始结果'],
  conclusion:   ['结论', '判定'],
  remark:       ['备注', '说明', '检测时间'],
}
const MISSING_TEXTS = new Set(['未测', '未检', 'n/a', 'na', 'null', '-', '—', '/'])

function norm(s) { return String(s ?? '').replace(/\s+/g, '').toLowerCase() }

function findCol(headers, key) {
  const normMap = new Map(headers.map((h) => [norm(h), h]))
  for (const alias of COL_ALIASES[key]) {
    const hit = normMap.get(norm(alias))
    if (hit !== undefined) return hit
  }
  return null
}

function getCell(row, key) {
  const aliases = COL_ALIASES[key]
  const normMap = new Map(Object.entries(row).map(([k, v]) => [norm(k), v]))
  for (const alias of aliases) {
    const v = normMap.get(norm(alias))
    if (v !== undefined) return v
  }
  return ''
}

function applyMergeFill(sheet, matrix) {
  const merges = sheet['!merges'] ?? []
  merges.forEach((m) => {
    const top = matrix[m.s.r]?.[m.s.c]
    if (top === undefined || top === null || String(top).trim() === '') return
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!matrix[r]) matrix[r] = []
      for (let c = m.s.c; c <= m.e.c; c++) {
        const cur = matrix[r][c]
        if (cur === undefined || cur === null || String(cur).trim() === '') matrix[r][c] = top
      }
    }
  })
}

function parseCtValue(raw) {
  const input = String(raw ?? '').trim()
  if (!input || MISSING_TEXTS.has(input.toLowerCase())) return { isMissing: true, rawText: input || null }
  const nums = input.match(/-?\d+(?:\.\d+)?/g) ?? []
  if (!nums.length) return { isMissing: true, rawText: input }
  return { isMissing: false, ctValue: Number(nums[0]), rawText: nums.length > 1 ? input : null }
}

function parseExcel(buffer) {
  const XLSX = window.XLSX
  const wb   = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  applyMergeFill(sheet, matrix)

  const headers = (matrix[0] ?? []).map((c) => String(c ?? '').trim())
  const dataRows = matrix.slice(1)

  const carry = { sample_id: '', sample_type: '', site_name: '', remark: '' }
  const rows = []
  const errors = []

  dataRows.forEach((cells, idx) => {
    const lineNo = idx + 2
    const rowObj = {}
    headers.forEach((h, i) => { if (h) rowObj[h] = cells[i] ?? '' })

    const rawSampleId   = String(getCell(rowObj, 'sample_id') ?? '').trim()
    const rawSampleType = String(getCell(rowObj, 'sample_type') ?? '').trim()
    const rawSiteName   = String(getCell(rowObj, 'site_name') ?? '').trim()
    const rawProjectName = String(getCell(rowObj, 'project_name') ?? '').trim()
    const rawRemark     = String(getCell(rowObj, 'remark') ?? '').trim()

    const sampleId   = rawSampleId   || carry.sample_id
    const sampleType = rawSampleType || carry.sample_type
    const siteName   = rawSiteName   || carry.site_name
    const remark     = rawRemark     || carry.remark

    if (rawSampleId)   carry.sample_id   = rawSampleId
    if (rawSampleType) carry.sample_type = rawSampleType
    if (rawSiteName)   carry.site_name   = rawSiteName
    if (rawRemark)     carry.remark      = rawRemark

    if (!sampleId) { errors.push(`第 ${lineNo} 行：样本编号不能为空`); return }
    if (!sampleType) { errors.push(`第 ${lineNo} 行：样本类型不能为空`); return }
    if (!siteName) { errors.push(`第 ${lineNo} 行：站点名称不能为空`); return }
    if (!rawProjectName) return // 空行跳过

    const rawCt = String(getCell(rowObj, 'ct_value') ?? '').trim()
    const { isMissing, ctValue, rawText: rawTextFromCt } = parseCtValue(rawCt)
    const rawTextField = String(getCell(rowObj, 'raw_text') ?? '').trim()
    const conclusion   = String(getCell(rowObj, 'conclusion') ?? '').trim()

    rows.push({
      sample_id:    sampleId,
      sample_type:  sampleType,
      site_name:    siteName,
      project_name: rawProjectName,
      ct_value:     ctValue,
      is_missing:   isMissing,
      raw_text:     rawTextFromCt || rawTextField || null,
      conclusion:   conclusion || null,
      remark:       remark || null,
    })
  })

  return { rows, errors }
}

export class ImportModule {
  constructor(authService) {
    this._auth = authService
    this._rows = []
    this._parseErrors = []
    this._sites = []          // 从 DB 加载的已知站点
  }

  render(container) {
    this._rows = []
    this._parseErrors = []
    container.innerHTML = this._idleHtml()
    this._bindIdle(container)
  }

  _idleHtml() {
    return `<div class="max-w-3xl fade-in">
      <div class="flex items-center justify-between mb-5">
        <div>
          <h1 class="text-xl font-semibold text-gray-900">Excel 导入</h1>
          <p class="text-sm text-gray-500 mt-0.5">支持标准模板或客户表头格式</p>
        </div>
        <button id="btn-template" class="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 transition-colors">
          下载模板
        </button>
      </div>

      <!-- 拖放区域 -->
      <div id="drop-zone"
        class="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center transition-colors cursor-pointer hover:border-blue-400">
        <svg class="mx-auto mb-3 w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <p class="text-gray-500 text-sm mb-3">拖放 Excel 文件到此处，或点击选择文件</p>
        <label class="cursor-pointer">
          <input id="file-input" type="file" accept=".xlsx,.xls" class="hidden">
          <span class="bg-blue-600 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
            选择文件
          </span>
        </label>
        <p class="text-xs text-gray-400 mt-3">支持 .xlsx / .xls 格式</p>
      </div>
    </div>`
  }

  _bindIdle(container) {
    // 模板下载
    container.querySelector('#btn-template')?.addEventListener('click', async () => {
      try {
        const blob = await downloadTemplate()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href = url; a.download = '导入模板.xlsx'; a.click()
        URL.revokeObjectURL(url)
      } catch (e) {
        showToast('模板下载失败：' + e.message, 'error')
      }
    })

    // 文件选择
    const onFile = (file) => { if (file) this._handleFile(container, file) }
    container.querySelector('#file-input')?.addEventListener('change', (e) => onFile(e.target.files?.[0]))

    // 拖放
    const dz = container.querySelector('#drop-zone')
    dz?.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drop-active') })
    dz?.addEventListener('dragleave', () => dz.classList.remove('drop-active'))
    dz?.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drop-active')
      onFile(e.dataTransfer.files?.[0])
    })
  }

  async _handleFile(container, file) {
    container.innerHTML = `<div class="py-20 text-center text-sm text-gray-400">
      <div class="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
      正在解析文件…</div>`

    try {
      const supabase = getSupabase()
      const [buffer, sitesResult] = await Promise.all([
        file.arrayBuffer(),
        supabase.from('sites').select('id, name').order('name'),
      ])
      const { rows, errors } = parseExcel(buffer)
      this._rows = rows
      this._parseErrors = errors
      this._sites = sitesResult.data ?? []
      this._renderPreview(container, file.name)
    } catch (e) {
      container.innerHTML = `<div class="max-w-3xl">
        <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
          <b>文件解析失败：</b>${e.message}
        </div>
        <button id="btn-reset" class="mt-4 text-sm text-blue-600 hover:underline">重新选择</button>
      </div>`
      container.querySelector('#btn-reset')?.addEventListener('click', () => this.render(container))
    }
  }

  _renderPreview(container, filename) {
    const rows   = this._rows
    const errors = this._parseErrors

    // 按样本汇总
    const bySample = new Map()
    rows.forEach((r) => {
      if (!bySample.has(r.sample_id)) bySample.set(r.sample_id, [])
      bySample.get(r.sample_id).push(r)
    })

    // 站点名称检查
    const siteNameSet     = new Set(this._sites.map((s) => s.name))
    const uniqueSiteNames = [...new Set(rows.map((r) => r.site_name).filter(Boolean))].sort()
    const unknownSites    = uniqueSiteNames.filter((n) => !siteNameSet.has(n))

    const siteMappingHtml = uniqueSiteNames.length > 0 ? `
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-medium text-gray-900 text-sm">站点名称检查</h2>
        ${unknownSites.length > 0
          ? `<span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">${unknownSites.length} 个站点不在数据库中，导入时将自动创建</span>`
          : `<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">全部已匹配</span>`}
      </div>
      <div class="space-y-2">
        ${uniqueSiteNames.map((name) => {
          const known    = siteNameSet.has(name)
          const rowCount = rows.filter((r) => r.site_name === name).length
          const ic       = 'border border-amber-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-56 bg-white'
          return `<div class="flex items-center gap-3">
            <span class="text-xs w-4 text-center ${known ? 'text-green-600' : 'text-amber-500'}">${known ? '✓' : '⚠'}</span>
            <span class="text-sm text-gray-800 w-48 truncate font-mono" title="${this._esc(name)}">${this._esc(name)}</span>
            <span class="text-xs text-gray-400">${rowCount} 行</span>
            ${known
              ? `<span class="text-xs text-green-600">已匹配</span>`
              : `<span class="text-xs text-amber-600 shrink-0">或修正为：</span>
                 <input class="site-map-input ${ic}" data-original="${this._esc(name)}" value="${this._esc(name)}" placeholder="站点名称">`}
          </div>`
        }).join('')}
      </div>
    </div>` : ''

    container.innerHTML = `<div class="max-w-4xl fade-in space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold text-gray-900">导入预览</h1>
          <p class="text-sm text-gray-500 mt-0.5">${filename} · ${rows.length} 条数据行 · ${bySample.size} 个样本</p>
        </div>
        <button id="btn-reset" class="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50">重新选择</button>
      </div>

      ${errors.length > 0 ? `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p class="text-sm font-medium text-amber-800 mb-2">解析发现以下问题（有效行仍可继续导入）：</p>
        <ul class="list-disc list-inside text-sm text-amber-700 space-y-0.5">
          ${errors.map((e) => `<li>${this._esc(e)}</li>`).join('')}
        </ul>
      </div>` : ''}

      ${siteMappingHtml}

      <!-- 预览表 -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-auto max-h-96">
        ${rows.length === 0 ? '<div class="p-8 text-center text-sm text-gray-400">未识别到有效数据行</div>' : `
        <table class="w-full text-xs">
          <thead class="bg-gray-50 border-b border-gray-100 sticky top-0">
            <tr>
              ${['样本编号','样本类型','站点','项目','Ct值','缺失','原始文本','结论'].map((h) =>
                `<th class="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${rows.slice(0, 100).map((r) => {
              const knownSite = siteNameSet.has(r.site_name)
              return `<tr class="hover:bg-gray-50/50 ${!knownSite ? 'bg-amber-50/30' : ''}">
                <td class="px-3 py-2 font-mono text-gray-900">${this._esc(r.sample_id)}</td>
                <td class="px-3 py-2 text-gray-700">${this._esc(r.sample_type)}</td>
                <td class="px-3 py-2 ${!knownSite ? 'text-amber-700 font-medium' : 'text-gray-700'}">${this._esc(r.site_name)}</td>
                <td class="px-3 py-2 text-gray-900">${this._esc(r.project_name)}</td>
                <td class="px-3 py-2 font-mono">${r.ct_value ?? '-'}</td>
                <td class="px-3 py-2">${r.is_missing ? '✓' : ''}</td>
                <td class="px-3 py-2 text-gray-500">${this._esc(r.raw_text ?? '')}</td>
                <td class="px-3 py-2 text-gray-500">${this._esc(r.conclusion ?? '')}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
        ${rows.length > 100 ? `<div class="p-3 text-xs text-gray-400 text-center">仅显示前 100 行，共 ${rows.length} 行</div>` : ''}`}
      </div>

      <div id="import-error" class="hidden bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1"></div>
      <div id="import-progress" class="hidden text-sm text-gray-500"></div>

      <div class="flex gap-3">
        ${rows.length > 0 ? `
        <button id="btn-import" class="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
          确认导入 (${bySample.size} 个样本)
        </button>` : ''}
        <button id="btn-reset" class="text-sm border border-gray-300 rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-50">取消</button>
      </div>
    </div>`

    container.querySelectorAll('#btn-reset').forEach((btn) =>
      btn.addEventListener('click', () => this.render(container))
    )
    container.querySelector('#btn-import')?.addEventListener('click', () =>
      this._doImport(container)
    )
  }

  async _doImport(container) {
    const btn      = container.querySelector('#btn-import')
    const errEl    = container.querySelector('#import-error')
    const progress = container.querySelector('#import-progress')

    btn.disabled   = true
    btn.textContent = '导入中…'
    errEl.classList.add('hidden')
    progress.classList.remove('hidden')

    const supabase = getSupabase()
    const user     = this._auth.getUser()
    if (!user) { showToast('请先登录', 'error'); return }

    // 收集站点名称映射（用户可能在预览中修改了站点名称）
    const siteMappings = {}
    container.querySelectorAll('.site-map-input').forEach((input) => {
      const original = input.dataset.original
      const renamed  = input.value.trim()
      if (original && renamed) siteMappings[original] = renamed
    })

    // 应用映射到行数据
    const mappedRows = this._rows.map((r) => ({
      ...r,
      site_name: siteMappings[r.site_name] ?? r.site_name,
    }))

    // 按样本分组
    const bySample = new Map()
    mappedRows.forEach((r) => {
      if (!bySample.has(r.sample_id)) bySample.set(r.sample_id, [])
      bySample.get(r.sample_id).push(r)
    })

    // 站点 ID 缓存（避免重复查询）
    const siteIdCache = new Map()

    const importErrors = []
    let imported = 0
    const total  = bySample.size
    let done     = 0

    for (const [sampleId, sampleRows] of bySample) {
      done++
      progress.textContent = `正在处理 ${done} / ${total}：${sampleId}…`

      try {
        // 确保样本存在
        const { data: existing } = await supabase.from('samples').select('id').eq('id', sampleId).maybeSingle()
        if (!existing) {
          const first = sampleRows[0]
          const { error: sErr } = await supabase.from('samples').insert({
            id: sampleId, sample_type: first.sample_type,
          })
          if (sErr) throw new Error(`创建样本失败: ${sErr.message}`)
        }

        // 按站点分组
        const bySite = new Map()
        sampleRows.forEach((r) => {
          if (!bySite.has(r.site_name)) bySite.set(r.site_name, [])
          bySite.get(r.site_name).push(r)
        })

        for (const [siteName, siteRows] of bySite) {
          // 查找站点 ID，缓存结果
          let siteId = siteIdCache.get(siteName)
          if (!siteId) {
            const { data: site } = await supabase.from('sites').select('id').eq('name', siteName).maybeSingle()
            if (site) {
              siteId = site.id
            } else {
              // 站点不存在 → 自动创建
              const { data: newSite, error: siteErr } = await supabase
                .from('sites').insert({ name: siteName }).select('id').single()
              if (siteErr || !newSite) {
                importErrors.push(`站点"${siteName}"创建失败：${siteErr?.message ?? '未知错误'}，相关行已跳过`)
                continue
              }
              siteId = newSite.id
            }
            siteIdCache.set(siteName, siteId)
          }

          // 创建检测记录
          const { data: record, error: recErr } = await supabase
            .from('detection_records')
            .insert({ sample_id: sampleId, site_id: siteId, source_type: 'IMPORT',
              operator_id: user.id, remark: siteRows[0].remark ?? null })
            .select('id').single()
          if (recErr || !record) { importErrors.push(`${sampleId} 站点 ${siteName} 检测记录创建失败`); continue }

          // 检测项目
          const itemsToInsert = siteRows.map((r) => ({
            record_id:    record.id,
            project_name: r.project_name,
            ct_value:     r.is_missing ? null : (r.ct_value ?? null),
            raw_text:     r.raw_text ?? null,
            conclusion:   r.conclusion ?? null,
            is_missing:   r.is_missing ?? false,
          }))
          const { error: iErr } = await supabase.from('detection_items').insert(itemsToInsert)
          if (iErr) { importErrors.push(`${sampleId} 检测项目写入失败: ${iErr.message}`); continue }

          // 版本
          const { data: existingVers } = await supabase.from('versions').select('version_no')
            .eq('record_id', record.id).order('version_no', { ascending: false }).limit(1)
          const newVersionNo = (existingVers?.[0]?.version_no ?? 0) + 1

          await supabase.from('versions').update({ is_latest: false }).eq('record_id', record.id).eq('is_latest', true)

          const { data: version, error: vErr } = await supabase.from('versions')
            .insert({ sample_id: sampleId, record_id: record.id, version_no: newVersionNo,
              action_type: 'IMPORT', operator_id: user.id, is_latest: true, is_final: false })
            .select('id').single()
          if (vErr || !version) { importErrors.push(`${sampleId} 版本创建失败`); continue }

          await supabase.from('version_snapshots').insert(
            itemsToInsert.map((item) => ({
              version_id: version.id, project_name: item.project_name,
              ct_value: item.ct_value, raw_text: item.raw_text,
              conclusion: item.conclusion, is_missing: item.is_missing,
            }))
          )
        }

        // 触发比对
        await triggerCompare(sampleId).catch((e) => console.warn('compare:', e.message))
        imported++
      } catch (err) {
        importErrors.push(err.message || `${sampleId} 导入失败`)
      }
    }

    progress.classList.add('hidden')

    if (importErrors.length > 0) {
      errEl.innerHTML = `<b>以下问题需注意：</b><ul class="list-disc list-inside mt-1">
        ${importErrors.map((e) => `<li>${this._esc(e)}</li>`).join('')}</ul>`
      errEl.classList.remove('hidden')
    }

    showToast(`成功导入 ${imported} 个样本`, imported > 0 ? 'success' : 'info')

    btn.disabled    = false
    btn.textContent = '重新导入'
    btn.onclick     = () => this.render(container)
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
