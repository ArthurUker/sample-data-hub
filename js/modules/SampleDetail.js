/**
 * SampleDetail - 样本详情模块
 * 包含：基本信息、检测数据（可编辑）、比对结果表、版本历史、审核定版
 */
import { getSupabase } from '../services/AuthService.js'
import { router } from '../core/Router.js'
import { triggerCompare } from '../services/ApiService.js'
import { showToast } from '../app.js'

const STATUS_LABEL = { PENDING: '待处理', IN_REVIEW: '审核中', FINALIZED: '已定版' }
const STATUS_COLOR = {
  PENDING:   'bg-gray-100 text-gray-600',
  IN_REVIEW: 'bg-yellow-100 text-yellow-700',
  FINALIZED: 'bg-green-100 text-green-700',
}
const COMP_CONFIG = {
  CONSISTENT:   { label: '一致',     color: 'text-green-700 bg-green-50' },
  DIVERGENT:    { label: '差异',     color: 'text-red-700 bg-red-50' },
  MISSING_DATA: { label: '数据缺失', color: 'text-orange-700 bg-orange-50' },
}
const ACTION_LABEL  = { CREATE: '新建', EDIT: '修改', IMPORT: '导入' }
const SOURCE_LABEL  = { MANUAL: '手动录入', IMPORT: '导入' }
const SOURCE_COLOR  = { MANUAL: 'bg-blue-50 text-blue-700', IMPORT: 'bg-purple-50 text-purple-700' }

export class SampleDetailModule {
  constructor(authService) {
    this._auth = authService
  }

  async render(container, params) {
    const id = params.id
    if (!id) { router.go('/samples'); return }

    container.innerHTML = `<div class="py-20 text-center text-sm text-gray-400">
      <div class="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>加载中…</div>`

    const supabase = getSupabase()
    const { data: sample } = await supabase
      .from('samples')
      .select(`*,
        detection_records(id, site_id, source_type, remark, created_at, operator_id,
          sites(name), profiles!detection_records_operator_id_fkey(name),
          detection_items(*)),
        versions(id, version_no, action_type, is_latest, is_final, note, created_at, record_id, operator_id,
          profiles!versions_operator_id_fkey(name), version_snapshots(*)),
        comparison_results(*),
        reviews(id, conclusion, remark, is_effective, created_at, selected_version_id, reviewer_id,
          profiles!reviews_reviewer_id_fkey(name))`)
      .eq('id', id)
      .single()

    if (!sample) { router.go('/samples'); return }

    const versions = [...(sample.versions ?? [])].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )
    const profile   = this._auth.getProfile()
    const canEdit   = profile?.role === 'ADMIN' || profile?.role === 'OPERATOR'
    const canReview = profile?.role === 'ADMIN' || profile?.role === 'REVIEWER'

    container.innerHTML = this._html(sample, versions, canEdit, canReview)
    this._bind(container, sample, versions, canEdit, canReview, supabase)
  }

  _html(sample, versions, canEdit, canReview) {
    const status      = sample.status ?? 'PENDING'
    const comparisons = sample.comparison_results ?? []
    const reviews     = (sample.reviews ?? []).filter((r) => r.is_effective !== false)
    const records     = [...(sample.detection_records ?? [])].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    )

    return `<div class="space-y-5 fade-in">
      <div class="flex items-start justify-between">
        <div>
          <button id="back-btn" class="text-sm text-gray-400 hover:text-gray-600 mb-1 block">← 样本台账</button>
          <h1 class="text-xl font-semibold text-gray-900 font-mono">${this._esc(sample.id)}</h1>
          <div class="flex items-center gap-3 mt-1">
            <span class="text-sm text-gray-500">${this._esc(sample.sample_type)}</span>
            ${sample.sample_source ? `<span class="text-sm text-gray-400">来源：${this._esc(sample.sample_source)}</span>` : ''}
            <span class="text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600'}">
              ${STATUS_LABEL[status] ?? status}
            </span>
          </div>
        </div>
        ${canEdit ? `<a href="#/edit?id=${this._esc(sample.id)}"
          class="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          + 新增检测记录
        </a>` : ''}
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-4 gap-4 text-sm">
        ${['collection_date:采样日期', 'submission_date:送检日期'].map((kv) => {
          const [k, label] = kv.split(':')
          return `<div><div class="text-gray-400 mb-0.5">${label}</div>
            <div class="text-gray-900">${this._esc(sample[k] ?? '-')}</div></div>`
        }).join('')}
        <div><div class="text-gray-400 mb-0.5">更新时间</div>
          <div class="text-gray-900">${new Date(sample.updated_at).toLocaleDateString('zh-CN')}</div></div>
        <div><div class="text-gray-400 mb-0.5">检测记录数</div>
          <div class="text-gray-900">${records.length}</div></div>
      </div>

      ${this._detectionDataSection(records, canEdit)}
      ${this._comparisonTable(comparisons)}
      ${this._versionTimeline(versions, sample.final_version_id)}
      ${canReview ? this._reviewSection(sample.id, versions, reviews) : ''}
    </div>`
  }

  _detectionDataSection(records, canEdit) {
    if (records.length === 0) {
      return `<div class="bg-white rounded-xl border border-gray-200 p-5">
        <h2 class="font-medium text-gray-900 mb-2">检测数据</h2>
        <p class="text-sm text-gray-400">暂无检测记录，点击"新增检测记录"录入数据</p>
      </div>`
    }

    const allProjects = [...new Set(
      records.flatMap((r) => (r.detection_items ?? []).map((i) => i.project_name))
    )].sort()

    const matrixHtml = `
    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="bg-gray-50">
            <th class="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 min-w-[100px] sticky left-0 bg-gray-50">检测项目</th>
            ${records.map((r) => `
              <th class="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 min-w-[150px]">
                <div>${this._esc(r.sites?.name ?? r.site_id)}</div>
                <div class="flex items-center gap-1 mt-0.5">
                  <span class="text-xs px-1.5 py-0.5 rounded ${SOURCE_COLOR[r.source_type] ?? 'bg-gray-100 text-gray-600'}">
                    ${SOURCE_LABEL[r.source_type] ?? r.source_type}
                  </span>
                  <span class="text-xs text-gray-400">${this._esc(r.profiles?.name ?? '')}</span>
                </div>
              </th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${allProjects.map((proj) => {
            return `<tr class="hover:bg-gray-50/50">
              <td class="px-3 py-2 font-medium text-gray-800 border border-gray-200 sticky left-0 bg-white">${this._esc(proj)}</td>
              ${records.map((r) => {
                const item = (r.detection_items ?? []).find((i) => i.project_name === proj)
                if (!item) return `<td class="px-3 py-2 text-gray-300 border border-gray-200 text-center">—</td>`
                if (item.is_missing) {
                  return `<td class="px-3 py-2 border border-gray-200 bg-orange-50/30">
                    <span class="text-xs text-orange-600 font-medium">缺失</span>
                    ${item.raw_text ? `<span class="text-xs text-gray-400 ml-1">${this._esc(item.raw_text)}</span>` : ''}
                  </td>`
                }
                return `<td class="px-3 py-2 border border-gray-200">
                  <span class="font-mono text-gray-900">${item.ct_value ?? '—'}</span>
                  ${item.raw_text ? `<span class="text-xs text-gray-400 ml-1">(${this._esc(item.raw_text)})</span>` : ''}
                  ${item.conclusion ? `<div class="text-xs text-blue-600 mt-0.5">${this._esc(item.conclusion)}</div>` : ''}
                </td>`
              }).join('')}
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`

    const recordCardsHtml = canEdit ? records.map((r, idx) => this._recordCard(r, idx)).join('') : ''

    return `
    <div class="bg-white rounded-xl border border-gray-200 p-5" id="detection-data-panel">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-medium text-gray-900">检测数据</h2>
        <span class="text-xs text-gray-400">${records.length} 个站点 · ${allProjects.length} 个检测项目</span>
      </div>
      ${matrixHtml}
      ${canEdit ? `
      <div class="mt-5 space-y-4" id="record-cards">
        <div class="flex items-center gap-2 mt-2">
          <div class="h-px flex-1 bg-gray-200"></div>
          <span class="text-xs text-gray-400 px-2">各站点数据编辑</span>
          <div class="h-px flex-1 bg-gray-200"></div>
        </div>
        ${recordCardsHtml}
      </div>` : ''}
    </div>`
  }

  _recordCard(record, idx) {
    const items   = [...(record.detection_items ?? [])].sort((a, b) => a.project_name.localeCompare(b.project_name))
    const srcCls  = SOURCE_COLOR[record.source_type] ?? 'bg-gray-100 text-gray-600'
    const srcLbl  = SOURCE_LABEL[record.source_type] ?? record.source_type

    return `
    <div class="border border-gray-200 rounded-lg overflow-hidden" id="record-card-${idx}" data-record-id="${record.id}">
      <div class="bg-gray-50 px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3 flex-wrap">
          <span class="font-medium text-gray-900 text-sm">${this._esc(record.sites?.name ?? record.site_id)}</span>
          <span class="text-xs px-1.5 py-0.5 rounded ${srcCls}">${srcLbl}</span>
          <span class="text-xs text-gray-400">${new Date(record.created_at).toLocaleString('zh-CN')}</span>
          ${record.remark ? `<span class="text-xs text-gray-500 italic">${this._esc(record.remark)}</span>` : ''}
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button class="edit-btn text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors" data-record-idx="${idx}">编辑</button>
          <button class="save-btn hidden text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors" data-record-idx="${idx}">保存</button>
          <button class="cancel-btn hidden text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors" data-record-idx="${idx}">取消</button>
        </div>
      </div>
      <div class="record-error hidden text-xs text-red-600 bg-red-50 border-b border-red-200 px-4 py-2"></div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50/60 border-b border-gray-100">
            <tr>
              ${['项目名称','Ct 值','原始文本','结论','缺失'].map((h) =>
                `<th class="text-left px-4 py-2 font-medium text-gray-500 text-xs">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100" id="items-body-${idx}">
            ${items.map((item) => this._itemViewRow(item)).join('')}
          </tbody>
        </table>
      </div>
      <div class="add-row-area hidden px-4 py-3 border-t border-gray-100 bg-gray-50/30">
        <button class="add-item-row text-xs text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 px-2.5 py-1 rounded-lg" data-record-idx="${idx}">+ 添加检测项目</button>
      </div>
    </div>`
  }

  _itemViewRow(item) {
    return `<tr class="item-row" data-item-id="${item.id}">
      <td class="px-4 py-2.5 font-medium text-gray-900">${this._esc(item.project_name)}</td>
      <td class="px-4 py-2.5 font-mono text-gray-800">${item.is_missing ? '<span class="text-orange-500 text-xs">缺失</span>' : (item.ct_value ?? '—')}</td>
      <td class="px-4 py-2.5 text-gray-500 text-xs">${this._esc(item.raw_text ?? '')}</td>
      <td class="px-4 py-2.5 text-gray-500 text-xs">${this._esc(item.conclusion ?? '')}</td>
      <td class="px-4 py-2.5 text-gray-400 text-xs">${item.is_missing ? '✓' : ''}</td>
    </tr>`
  }

  _itemEditRow(item) {
    const ic = 'border border-gray-200 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400'
    return `<tr class="item-row bg-blue-50/20" data-item-id="${item.id}">
      <td class="px-3 py-2"><input class="item-project ${ic}" value="${this._esc(item.project_name)}" placeholder="项目名称 *"></td>
      <td class="px-3 py-2"><input class="item-ct ${ic} w-28" type="text" value="${this._esc(String(item.ct_value ?? ''))}" placeholder="Ct 值"></td>
      <td class="px-3 py-2"><input class="item-rawtext ${ic}" value="${this._esc(item.raw_text ?? '')}" placeholder="原始文本"></td>
      <td class="px-3 py-2"><input class="item-conclusion ${ic}" value="${this._esc(item.conclusion ?? '')}" placeholder="结论"></td>
      <td class="px-3 py-2 text-center">
        <div class="flex items-center gap-2">
          <input type="checkbox" class="item-missing accent-blue-600" ${item.is_missing ? 'checked' : ''}>
          <button type="button" class="remove-item text-red-400 hover:text-red-600 text-xs" title="删除">✕</button>
        </div>
      </td>
    </tr>`
  }

  _itemNewRow() {
    const ic = 'border border-gray-200 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400 bg-green-50/40'
    return `<tr class="item-row bg-green-50/20" data-item-id="NEW">
      <td class="px-3 py-2"><input class="item-project ${ic}" value="" placeholder="项目名称 *"></td>
      <td class="px-3 py-2"><input class="item-ct ${ic} w-28" type="text" value="" placeholder="Ct 值"></td>
      <td class="px-3 py-2"><input class="item-rawtext ${ic}" value="" placeholder="原始文本"></td>
      <td class="px-3 py-2"><input class="item-conclusion ${ic}" value="" placeholder="结论"></td>
      <td class="px-3 py-2 text-center">
        <div class="flex items-center gap-2">
          <input type="checkbox" class="item-missing accent-blue-600">
          <button type="button" class="remove-item text-red-400 hover:text-red-600 text-xs" title="删除">✕</button>
        </div>
      </td>
    </tr>`
  }

  _comparisonTable(comparisons) {
    if (comparisons.length === 0) {
      return `<div class="bg-white rounded-xl border border-gray-200 p-5">
        <h2 class="font-medium text-gray-900 mb-2">比对结果</h2>
        <p class="text-sm text-gray-400">暂无比对数据，录入多站点检测记录后自动生成</p>
      </div>`
    }
    const hasDivergent = comparisons.some((c) => c.comp_status === 'DIVERGENT')
    return `
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-medium text-gray-900">比对结果</h2>
        ${hasDivergent ? '<span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">存在差异，需审核</span>' : ''}
      </div>
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>${['检测项目','最小 Ct','最大 Ct','差值','阈值','状态'].map((h) =>
            `<th class="text-left px-4 py-2.5 font-medium text-gray-600">${h}</th>`).join('')}</tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${comparisons.map((c) => {
            const cfg = COMP_CONFIG[c.comp_status] ?? { label: c.comp_status, color: 'text-gray-600 bg-gray-50' }
            return `<tr class="${c.comp_status === 'DIVERGENT' ? 'bg-red-50/30' : ''}">
              <td class="px-4 py-2.5 font-medium text-gray-900">${this._esc(c.project_name)}</td>
              <td class="px-4 py-2.5 font-mono text-gray-700">${c.min_ct ?? '-'}</td>
              <td class="px-4 py-2.5 font-mono text-gray-700">${c.max_ct ?? '-'}</td>
              <td class="px-4 py-2.5 font-mono ${c.comp_status === 'DIVERGENT' ? 'text-red-700 font-semibold' : 'text-gray-700'}">
                ${c.ct_diff !== null ? Number(c.ct_diff).toFixed(2) : '-'}
              </td>
              <td class="px-4 py-2.5 font-mono text-gray-500">${c.threshold}</td>
              <td class="px-4 py-2.5"><span class="text-xs px-2 py-0.5 rounded-full ${cfg.color}">${cfg.label}</span></td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
      <p class="text-xs text-gray-400 mt-2">最后计算于 ${new Date(comparisons[0]?.calculated_at).toLocaleString('zh-CN')}</p>
    </div>`
  }

  _versionTimeline(versions, finalVersionId) {
    if (versions.length === 0) {
      return `<div class="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">暂无版本记录</div>`
    }
    return `
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <h2 class="font-medium text-gray-900 mb-4">版本历史</h2>
      <div class="space-y-4">
        ${versions.map((v) => {
          const isFinal  = v.id === finalVersionId
          const dotColor = isFinal ? 'bg-green-500' : v.is_latest ? 'bg-blue-500' : 'bg-gray-300'
          const snapshots = v.version_snapshots ?? []
          return `
          <div class="flex gap-4">
            <div class="flex flex-col items-center">
              <div class="w-3 h-3 rounded-full mt-1 flex-shrink-0 ${dotColor}"></div>
              <div class="w-px flex-1 bg-gray-200 mt-1"></div>
            </div>
            <div class="pb-4 flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium text-gray-900">v${v.version_no}</span>
                <span class="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">${ACTION_LABEL[v.action_type] ?? v.action_type}</span>
                ${isFinal ? '<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">最终版</span>' : ''}
                ${v.is_latest && !isFinal ? '<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">最新</span>' : ''}
              </div>
              <p class="text-xs text-gray-500">
                ${v.profiles?.name ?? '未知操作员'} · ${new Date(v.created_at).toLocaleString('zh-CN')}
                ${v.note ? ` · ${this._esc(v.note)}` : ''}
              </p>
              ${snapshots.length > 0 ? `
              <div class="mt-2 text-xs text-gray-600 flex flex-wrap gap-2">
                ${snapshots.map((s) => `
                  <span class="bg-gray-50 border border-gray-200 px-2 py-0.5 rounded font-mono">
                    ${this._esc(s.project_name)}:${s.is_missing ? '<em class="text-gray-400 not-italic">缺失</em>' : this._esc(String(s.ct_value ?? '-'))}
                  </span>`).join('')}
              </div>` : ''}
            </div>
          </div>`
        }).join('')}
      </div>
    </div>`
  }

  _reviewSection(sampleId, versions, reviews) {
    const latestVersionId = versions.find((v) => v.is_latest)?.id ?? ''
    return `
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <h2 class="font-medium text-gray-900 mb-4">审核定版</h2>
      ${reviews.length > 0 ? `
      <div class="mb-5 space-y-3">
        ${reviews.map((r) => {
          const accepted = r.conclusion === 'ACCEPTED'
          const vNo = versions.find((v) => v.id === r.selected_version_id)?.version_no ?? '?'
          return `<div class="rounded-lg p-3 text-sm border ${accepted ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-medium">${accepted ? '✓ 已定版' : '✗ 已驳回'}</span>
              <span class="text-gray-500">选定 v${vNo}</span>
              <span class="text-gray-400">· ${r.profiles?.name ?? '未知'}</span>
              <span class="text-gray-400">· ${new Date(r.created_at).toLocaleString('zh-CN')}</span>
            </div>
            ${r.remark ? `<p class="text-gray-600">${this._esc(r.remark)}</p>` : ''}
          </div>`
        }).join('')}
      </div>` : ''}
      <form id="review-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">选定版本</label>
          <select id="review-version" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            ${versions.map((v) => `<option value="${v.id}" ${v.id === latestVersionId ? 'selected' : ''}>v${v.version_no} ${v.is_latest ? '（最新）' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="flex gap-3">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="review-conclusion" value="ACCEPTED" checked class="accent-green-600"> 通过定版
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="review-conclusion" value="REJECTED" class="accent-red-600"> 驳回
          </label>
        </div>
        <input id="review-remark" type="text" placeholder="备注（可选）"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <div id="review-error" class="hidden text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
        <button type="submit" id="review-submit"
          class="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
          提交审核
        </button>
      </form>
    </div>`
  }

  _bind(container, sample, versions, canEdit, canReview, supabase) {
    container.querySelector('#back-btn')?.addEventListener('click', () => router.go('/samples'))
    if (canEdit)   this._bindDetectionEdit(container, sample, supabase)
    if (canReview) this._bindReview(container, sample, versions, supabase)
  }

  _bindDetectionEdit(container, sample, supabase) {
    const records = [...(sample.detection_records ?? [])].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    )

    records.forEach((record, idx) => {
      const card      = container.querySelector(`#record-card-${idx}`)
      if (!card) return
      const editBtn   = card.querySelector('.edit-btn')
      const saveBtn   = card.querySelector('.save-btn')
      const cancelBtn = card.querySelector('.cancel-btn')
      const tbody     = card.querySelector(`#items-body-${idx}`)
      const addArea   = card.querySelector('.add-row-area')
      const errorEl   = card.querySelector('.record-error')
      const addRowBtn = card.querySelector('.add-item-row')
      let   originalHtml = tbody.innerHTML

      editBtn.addEventListener('click', () => {
        originalHtml = tbody.innerHTML
        const items = [...(record.detection_items ?? [])].sort((a, b) => a.project_name.localeCompare(b.project_name))
        tbody.innerHTML = items.map((item) => this._itemEditRow(item)).join('')
        this._bindRemoveRows(tbody)
        addArea.classList.remove('hidden')
        editBtn.classList.add('hidden')
        saveBtn.classList.remove('hidden')
        cancelBtn.classList.remove('hidden')
        errorEl.classList.add('hidden')
      })

      addRowBtn?.addEventListener('click', () => {
        tbody.insertAdjacentHTML('beforeend', this._itemNewRow())
        this._bindRemoveRows(tbody)
        tbody.lastElementChild?.querySelector('.item-project')?.focus()
      })

      cancelBtn.addEventListener('click', () => {
        tbody.innerHTML = originalHtml
        addArea.classList.add('hidden')
        editBtn.classList.remove('hidden')
        saveBtn.classList.add('hidden')
        cancelBtn.classList.add('hidden')
        errorEl.classList.add('hidden')
      })

      saveBtn.addEventListener('click', async () => {
        errorEl.classList.add('hidden')
        saveBtn.disabled = true
        saveBtn.textContent = '保存中…'
        try {
          await this._saveRecordEdits(tbody, record, sample.id, supabase)
          showToast('已保存并生成新版本', 'success')
          router.go(`/sample?id=${encodeURIComponent(sample.id)}`)
        } catch (err) {
          errorEl.textContent = err.message || '保存失败'
          errorEl.classList.remove('hidden')
          saveBtn.disabled = false
          saveBtn.textContent = '保存'
        }
      })
    })
  }

  _bindRemoveRows(tbody) {
    tbody.querySelectorAll('.remove-item').forEach((btn) => {
      const newBtn = btn.cloneNode(true)
      btn.replaceWith(newBtn)
      newBtn.addEventListener('click', () => newBtn.closest('tr').remove())
    })
  }

  async _saveRecordEdits(tbody, record, sampleId, supabase) {
    const user = this._auth.getUser()
    if (!user) throw new Error('请先登录')

    const items = [...tbody.querySelectorAll('tr.item-row')].map((row) => ({
      project_name: row.querySelector('.item-project')?.value.trim() ?? '',
      ct_value:     row.querySelector('.item-ct')?.value.trim() ?? '',
      raw_text:     row.querySelector('.item-rawtext')?.value.trim() ?? '',
      conclusion:   row.querySelector('.item-conclusion')?.value.trim() ?? '',
      is_missing:   row.querySelector('.item-missing')?.checked ?? false,
    })).filter((i) => i.project_name)

    if (items.length === 0) throw new Error('请至少保留一个检测项目')

    // 1. 删除旧 items
    const { error: delErr } = await supabase.from('detection_items').delete().eq('record_id', record.id)
    if (delErr) throw delErr

    // 2. 插入新 items
    const newItems = items.map((i) => ({
      record_id:    record.id,
      project_name: i.project_name,
      ct_value:     i.is_missing ? null : (parseFloat(i.ct_value) || null),
      raw_text:     i.raw_text || null,
      conclusion:   i.conclusion || null,
      is_missing:   i.is_missing,
    }))
    const { error: insErr } = await supabase.from('detection_items').insert(newItems)
    if (insErr) throw insErr

    // 3. 新版本号
    const { data: existingVers } = await supabase.from('versions').select('version_no')
      .eq('record_id', record.id).order('version_no', { ascending: false }).limit(1)
    const newVersionNo = (existingVers?.[0]?.version_no ?? 0) + 1

    // 4. 旧版本 is_latest → false
    await supabase.from('versions').update({ is_latest: false }).eq('record_id', record.id).eq('is_latest', true)

    // 5. 创建新版本
    const { data: version, error: verErr } = await supabase.from('versions')
      .insert({ sample_id: sampleId, record_id: record.id, version_no: newVersionNo,
        action_type: 'EDIT', operator_id: user.id, is_latest: true, is_final: false })
      .select('id').single()
    if (verErr || !version) throw new Error(verErr?.message ?? '创建版本失败')

    // 6. 快照
    await supabase.from('version_snapshots').insert(
      newItems.map((i) => ({
        version_id: version.id, project_name: i.project_name,
        ct_value: i.ct_value, raw_text: i.raw_text,
        conclusion: i.conclusion, is_missing: i.is_missing,
      }))
    )

    // 7. 触发比对
    await triggerCompare(sampleId).catch((e) => console.warn('compare:', e.message))
  }

  _bindReview(container, sample, versions, supabase) {
    const reviewForm = container.querySelector('#review-form')
    if (!reviewForm) return

    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn   = container.querySelector('#review-submit')
      const errEl = container.querySelector('#review-error')
      errEl.classList.add('hidden')
      btn.disabled = true
      btn.textContent = '提交中…'

      try {
        const user = this._auth.getUser()
        if (!user) throw new Error('请先登录')

        const selectedVersionId = container.querySelector('#review-version').value
        const conclusion        = container.querySelector('input[name="review-conclusion"]:checked').value
        const remark            = container.querySelector('#review-remark').value.trim()

        const { error: reviewError } = await supabase.from('reviews').insert({
          sample_id: sample.id, reviewer_id: user.id,
          selected_version_id: selectedVersionId, conclusion, remark: remark || null,
        })
        if (reviewError) throw reviewError

        if (conclusion === 'ACCEPTED') {
          await Promise.all([
            supabase.from('samples').update({ final_version_id: selectedVersionId, status: 'FINALIZED' }).eq('id', sample.id),
            supabase.from('versions').update({ is_final: true }).eq('id', selectedVersionId),
          ])
        }
        showToast(conclusion === 'ACCEPTED' ? '已定版' : '已驳回', 'success')
        router.go(`/sample?id=${sample.id}`)
      } catch (err) {
        errEl.textContent = err.message || '提交失败'
        errEl.classList.remove('hidden')
        btn.disabled = false
        btn.textContent = '提交审核'
      }
    })
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
