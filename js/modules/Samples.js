/**
 * Samples - 样本台账列表模块
 */
import { getSupabase } from '../services/AuthService.js'
import { router } from '../core/Router.js'

const PAGE_SIZE = 20

const STATUS_LABEL = { PENDING: '待处理', IN_REVIEW: '审核中', FINALIZED: '已定版' }
const STATUS_COLOR = {
  PENDING:   'bg-gray-100 text-gray-600',
  IN_REVIEW: 'bg-yellow-100 text-yellow-700',
  FINALIZED: 'bg-green-100 text-green-700',
}

export class SamplesModule {
  constructor(authService) {
    this._auth = authService
  }

  async render(container, params) {
    const q      = params.q ?? ''
    const status = params.status ?? ''
    const comp   = params.comp ?? ''
    const page   = parseInt(params.page ?? '1', 10)

    container.innerHTML = this._skeleton()

    const supabase = getSupabase()
    const from = (page - 1) * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from('samples')
      .select(`id, sample_type, sample_source, status, updated_at,
        comparison_results(comp_status),
        detection_records(id, operator_id, created_at,
          profiles!detection_records_operator_id_fkey(name))`, { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (q)      query = query.ilike('id', `%${q}%`)
    if (status) query = query.eq('status', status)

    const { data, count } = await query
    let rows = data ?? []
    if (comp === 'divergent') {
      rows = rows.filter((s) => s.comparison_results?.some((r) => r.comp_status === 'DIVERGENT'))
    }

    const totalPages  = Math.ceil((count ?? 0) / PAGE_SIZE)
    const profile     = this._auth.getProfile()
    const canCreate   = profile?.role === 'ADMIN' || profile?.role === 'OPERATOR'

    container.innerHTML = this._html(rows, count ?? 0, { q, status, comp, page, totalPages, canCreate })
    this._bind(container, { q, status, comp, page, totalPages })
  }

  _skeleton() {
    return `<div class="space-y-3">
      ${Array(5).fill('<div class="skeleton h-14 rounded-xl"></div>').join('')}
    </div>`
  }

  _html(rows, count, { q, status, comp, page, totalPages, canCreate }) {
    return `
    <div class="fade-in">
      <!-- 标题栏 -->
      <div class="flex items-center justify-between mb-5">
        <div>
          <h1 class="text-xl font-semibold text-gray-900">样本台账</h1>
          <p class="text-sm text-gray-500 mt-0.5">共 ${count} 条样本</p>
        </div>
        ${canCreate ? `
        <div class="flex items-center gap-2">
          <a href="#/new" class="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">+ 新建样本</a>
        </div>` : ''}
      </div>

      <!-- 筛选栏 -->
      <div class="flex flex-wrap gap-2 mb-4">
        <input id="filter-q" type="text" value="${this._esc(q)}"
          placeholder="搜索样本编号…"
          class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500">

        <select id="filter-status" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="" ${!status ? 'selected' : ''}>全部状态</option>
          <option value="PENDING"   ${status==='PENDING'   ? 'selected' : ''}>待处理</option>
          <option value="IN_REVIEW" ${status==='IN_REVIEW' ? 'selected' : ''}>审核中</option>
          <option value="FINALIZED" ${status==='FINALIZED' ? 'selected' : ''}>已定版</option>
        </select>

        <select id="filter-comp" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value=""          ${!comp           ? 'selected' : ''}>全部比对</option>
          <option value="divergent" ${comp==='divergent' ? 'selected' : ''}>存在差异</option>
        </select>
      </div>

      <!-- 表格 -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        ${rows.length === 0 ? `
          <div class="py-16 text-center text-sm text-gray-400">暂无样本数据</div>
        ` : `
        <table class="w-full text-sm table-hover">
          <thead class="bg-gray-50 border-b border-gray-100">
            <tr>
              <th class="text-left px-5 py-3 font-medium text-gray-600">样本编号</th>
              <th class="text-left px-5 py-3 font-medium text-gray-600">类型</th>
              <th class="text-left px-5 py-3 font-medium text-gray-600">检测站点数</th>
              <th class="text-left px-5 py-3 font-medium text-gray-600">录入人</th>
              <th class="text-left px-5 py-3 font-medium text-gray-600">状态</th>
              <th class="text-left px-5 py-3 font-medium text-gray-600">更新时间</th>
              <th class="text-left px-5 py-3 font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${rows.map((s) => {
              const hasDivergent = s.comparison_results?.some((r) => r.comp_status === 'DIVERGENT')
              const records      = s.detection_records ?? []
              const recordCount  = records.length
              // 最近录入人（按 created_at 最新的记录取）
              const latestRecord = records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
              const operatorName = latestRecord?.profiles?.name ?? '—'
              return `<tr class="cursor-pointer hover:bg-gray-50 transition-colors" data-sample-id="${this._esc(s.id)}">
                <td class="px-5 py-3">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-medium text-gray-900">${this._esc(s.id)}</span>
                    ${hasDivergent ? '<span class="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">差异</span>' : ''}
                  </div>
                </td>
                <td class="px-5 py-3 text-gray-700">${this._esc(s.sample_type)}</td>
                <td class="px-5 py-3 text-gray-500">
                  ${recordCount > 0
                    ? `<span class="font-medium text-gray-800">${recordCount}</span><span class="text-gray-400 ml-1">个站点</span>`
                    : '<span class="text-gray-300">未录入</span>'}
                </td>
                <td class="px-5 py-3 text-gray-500 text-xs">${this._esc(operatorName)}</td>
                <td class="px-5 py-3">
                  <span class="text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[s.status] ?? 'bg-gray-100 text-gray-600'}">
                    ${STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </td>
                <td class="px-5 py-3 text-gray-500">${new Date(s.updated_at).toLocaleDateString('zh-CN')}</td>
                <td class="px-5 py-3">
                  <button class="text-blue-600 hover:text-blue-800 text-xs" data-sample-id="${this._esc(s.id)}">查看</button>
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table>`}
      </div>

      <!-- 分页 -->
      ${totalPages > 1 ? `
      <div class="flex items-center justify-between mt-4 text-sm text-gray-500">
        <span>第 ${page} / ${totalPages} 页</span>
        <div class="flex gap-2">
          ${page > 1 ? `<button id="page-prev" class="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">上一页</button>` : ''}
          ${page < totalPages ? `<button id="page-next" class="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">下一页</button>` : ''}
        </div>
      </div>` : ''}
    </div>`
  }

  _bind(container, { q, status, comp, page, totalPages }) {
    // 点击行跳转详情
    container.querySelectorAll('[data-sample-id]').forEach((el) => {
      el.addEventListener('click', () => {
        router.go(`/sample?id=${el.dataset.sampleId}`)
      })
    })

    // 筛选（防抖）
    let timer
    const doFilter = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const newQ      = container.querySelector('#filter-q')?.value.trim() ?? ''
        const newStatus = container.querySelector('#filter-status')?.value ?? ''
        const newComp   = container.querySelector('#filter-comp')?.value ?? ''
        router.go(`/samples?q=${encodeURIComponent(newQ)}&status=${newStatus}&comp=${newComp}&page=1`)
      }, 300)
    }
    container.querySelector('#filter-q')?.addEventListener('input', doFilter)
    container.querySelector('#filter-status')?.addEventListener('change', doFilter)
    container.querySelector('#filter-comp')?.addEventListener('change', doFilter)

    // 分页
    container.querySelector('#page-prev')?.addEventListener('click', () => {
      router.go(`/samples?q=${encodeURIComponent(q)}&status=${status}&comp=${comp}&page=${page - 1}`)
    })
    container.querySelector('#page-next')?.addEventListener('click', () => {
      router.go(`/samples?q=${encodeURIComponent(q)}&status=${status}&comp=${comp}&page=${page + 1}`)
    })
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
