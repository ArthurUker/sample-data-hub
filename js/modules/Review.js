/**
 * Review - 差异审核队列模块
 */
import { getSupabase } from '../services/AuthService.js'
import { router } from '../core/Router.js'

export class ReviewModule {
  constructor(authService) {
    this._auth = authService
  }

  async render(container) {
    const profile = this._auth.getProfile()
    if (!profile || (profile.role !== 'ADMIN' && profile.role !== 'REVIEWER')) {
      container.innerHTML = `<div class="py-20 text-center text-sm text-gray-400">您没有查看审核队列的权限</div>`
      return
    }

    container.innerHTML = `<div class="py-20 text-center text-sm text-gray-400">
      <div class="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>加载中…</div>`

    const supabase = getSupabase()
    const { data, count } = await supabase
      .from('samples')
      .select(`id, sample_type, sample_source, updated_at,
        comparison_results(project_name, ct_diff, threshold, comp_status)`,
        { count: 'exact' })
      .eq('status', 'IN_REVIEW')
      .order('updated_at', { ascending: false })

    const samples = data ?? []
    container.innerHTML = this._html(samples, count ?? 0)
    this._bind(container)
  }

  _html(samples, count) {
    return `<div class="fade-in">
      <div class="mb-5">
        <h1 class="text-xl font-semibold text-gray-900">差异审核</h1>
        <p class="text-sm text-gray-500 mt-0.5">共 ${count} 个样本待审核</p>
      </div>

      ${samples.length === 0 ? `
      <div class="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p class="text-gray-400 text-sm">暂无需要审核的样本</p>
        <a href="#/samples" class="text-blue-600 text-sm mt-2 inline-block hover:underline">返回样本台账</a>
      </div>` : `
      <div class="space-y-4">
        ${samples.map((s) => this._sampleCard(s)).join('')}
      </div>`}
    </div>`
  }

  _sampleCard(s) {
    const divergent = (s.comparison_results ?? []).filter((r) => r.comp_status === 'DIVERGENT')
    return `
    <div class="bg-white rounded-xl border border-red-200 p-5">
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="font-mono font-semibold text-gray-900">${this._esc(s.id)}</span>
            <span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              ${divergent.length} 项差异
            </span>
          </div>
          <p class="text-sm text-gray-500">
            ${this._esc(s.sample_type)}
            ${s.sample_source ? ` · ${this._esc(s.sample_source)}` : ''}
            · 更新于 ${new Date(s.updated_at).toLocaleDateString('zh-CN')}
          </p>
          ${divergent.length > 0 ? `
          <div class="mt-2 flex flex-wrap gap-2">
            ${divergent.map((d) => `
              <span class="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded font-mono">
                ${this._esc(d.project_name)}: Δ${Number(d.ct_diff ?? 0).toFixed(2)} (阈值 ${d.threshold})
              </span>`).join('')}
          </div>` : ''}
        </div>
        <button class="btn-review text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
          data-id="${this._esc(s.id)}">
          前往审核
        </button>
      </div>
    </div>`
  }

  _bind(container) {
    container.querySelectorAll('.btn-review').forEach((btn) => {
      btn.addEventListener('click', () => router.go(`/sample?id=${btn.dataset.id}`))
    })
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
