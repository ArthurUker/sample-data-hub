/**
 * SampleDetail - 样本详情模块
 * 包含：基本信息、比对结果表、版本历史、审核定版
 */
import { getSupabase } from '../services/AuthService.js'
import { router } from '../core/Router.js'
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
const ACTION_LABEL = { CREATE: '新建', EDIT: '修改', IMPORT: '导入' }

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
    this._bind(container, sample, versions, canReview, supabase)
  }

  _html(sample, versions, canEdit, canReview) {
    const status    = sample.status ?? 'PENDING'
    const comparisons = sample.comparison_results ?? []
    const reviews   = (sample.reviews ?? []).filter((r) => r.is_effective !== false)

    return `<div class="space-y-5 fade-in">
      <!-- 顶部：标题 + 操作 -->
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

      <!-- 基本信息 -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-4 gap-4 text-sm">
        ${['collection_date:采样日期', 'submission_date:送检日期'].map((kv) => {
          const [k, label] = kv.split(':')
          return `<div><div class="text-gray-400 mb-0.5">${label}</div>
            <div class="text-gray-900">${this._esc(sample[k] ?? '-')}</div></div>`
        }).join('')}
        <div><div class="text-gray-400 mb-0.5">更新时间</div>
          <div class="text-gray-900">${new Date(sample.updated_at).toLocaleDateString('zh-CN')}</div></div>
        <div><div class="text-gray-400 mb-0.5">检测记录数</div>
          <div class="text-gray-900">${(sample.detection_records ?? []).length}</div></div>
      </div>

      <!-- 比对结果 -->
      ${this._comparisonTable(comparisons)}

      <!-- 版本历史 -->
      ${this._versionTimeline(versions, sample.final_version_id)}

      <!-- 审核定版 -->
      ${canReview ? this._reviewSection(sample.id, versions, reviews) : ''}
    </div>`
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
          <tr>
            ${['检测项目','最小 Ct','最大 Ct','差值','阈值','状态'].map((h) =>
              `<th class="text-left px-4 py-2.5 font-medium text-gray-600">${h}</th>`
            ).join('')}
          </tr>
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
              <td class="px-4 py-2.5">
                <span class="text-xs px-2 py-0.5 rounded-full ${cfg.color}">${cfg.label}</span>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
      <p class="text-xs text-gray-400 mt-2">
        最后计算于 ${new Date(comparisons[0]?.calculated_at).toLocaleString('zh-CN')}
      </p>
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
                <span class="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  ${ACTION_LABEL[v.action_type] ?? v.action_type}
                </span>
                ${isFinal ? '<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">最终版</span>' : ''}
                ${v.is_latest && !isFinal ? '<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">最新</span>' : ''}
              </div>
              <p class="text-xs text-gray-500">
                ${v.profiles?.name ?? '未知操作员'} ·
                ${new Date(v.created_at).toLocaleString('zh-CN')}
                ${v.note ? ` · ${this._esc(v.note)}` : ''}
              </p>
              ${snapshots.length > 0 ? `
              <div class="mt-2 text-xs text-gray-600 flex flex-wrap gap-2">
                ${snapshots.map((s) => `
                  <span class="bg-gray-50 border border-gray-200 px-2 py-0.5 rounded font-mono">
                    ${this._esc(s.project_name)}:
                    ${s.is_missing ? '<em class="text-gray-400 not-italic">缺失</em>' : this._esc(String(s.ct_value ?? '-'))}
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

      <!-- 历史审核记录 -->
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

      <!-- 审核表单 -->
      <form id="review-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">选定版本</label>
          <select id="review-version" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            ${versions.map((v) => `
              <option value="${v.id}" ${v.id === latestVersionId ? 'selected' : ''}>
                v${v.version_no} ${v.is_latest ? '（最新）' : ''}
              </option>`).join('')}
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
        <div>
          <input id="review-remark" type="text" placeholder="备注（可选）"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div id="review-error" class="hidden text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
        <button type="submit" id="review-submit"
          class="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
          提交审核
        </button>
      </form>
    </div>`
  }

  _bind(container, sample, versions, canReview, supabase) {
    container.querySelector('#back-btn')?.addEventListener('click', () => router.go('/samples'))

    if (!canReview) return

    const reviewForm = container.querySelector('#review-form')
    if (!reviewForm) return

    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = container.querySelector('#review-submit')
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
          sample_id: sample.id,
          reviewer_id: user.id,
          selected_version_id: selectedVersionId,
          conclusion,
          remark: remark || null,
        })
        if (reviewError) throw reviewError

        if (conclusion === 'ACCEPTED') {
          await Promise.all([
            supabase.from('samples').update({ final_version_id: selectedVersionId, status: 'FINALIZED' }).eq('id', sample.id),
            supabase.from('versions').update({ is_final: true }).eq('id', selectedVersionId),
          ])
        }

        showToast(conclusion === 'ACCEPTED' ? '已定版' : '已驳回', 'success')
        // 重新渲染当前页
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
