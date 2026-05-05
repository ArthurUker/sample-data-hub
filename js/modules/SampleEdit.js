/**
 * SampleEdit - 数据录入模块
 * 处理两种情况：
 *   #/new         → 新建样本（空表单）
 *   #/edit?id=xxx → 为已有样本新增检测记录
 */
import { getSupabase } from '../services/AuthService.js'
import { router } from '../core/Router.js'
import { triggerCompare } from '../services/ApiService.js'
import { showToast } from '../app.js'

const DRAFT_KEY_NEW = (userId) => `sample-data-hub:draft:new-sample:${userId || 'anon'}`
const DRAFT_KEY_REC = (sampleId, userId) => `sample-data-hub:draft:record:${sampleId}:${userId || 'anon'}`

function defaultItem() {
  return { project_name: '', ct_value: '', raw_text: '', conclusion: '', is_missing: false }
}

export class SampleEditModule {
  constructor(authService) {
    this._auth = authService
    this._draftTimer = null
  }

  async render(container, params) {
    const sampleId = params.id   // 已有样本 ID（若有）
    const isNew    = !sampleId

    const profile = this._auth.getProfile()
    if (!profile) {
      // profile 尚未加载，显示 spinner，等待 redispatch 后重新渲染
      container.innerHTML = `<div class="py-20 text-center text-sm text-gray-400">
        <div class="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>加载中…</div>`
      return
    }
    if (profile.role !== 'ADMIN' && profile.role !== 'OPERATOR') {
      container.innerHTML = `<div class="max-w-lg bg-white rounded-xl border p-6 text-sm text-gray-500">
        您没有权限进行数据录入。</div>`
      return
    }

    container.innerHTML = `<div class="py-20 text-center text-sm text-gray-400">
      <div class="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>加载中…</div>`

    const supabase = getSupabase()
    let sites = []
    let sample = null

    if (isNew) {
      const { data } = await supabase.from('sites').select('id, name').order('name')
      sites = data ?? []
    } else {
      const [{ data: sampleData }, { data: siteData }] = await Promise.all([
        supabase.from('samples').select('id, sample_type').eq('id', sampleId).single(),
        supabase.from('sites').select('id, name').order('name'),
      ])
      if (!sampleData) { router.go('/samples'); return }
      sample = sampleData
      sites  = siteData ?? []
    }

    const userId    = this._auth.getUser()?.id ?? ''
    const draftKey  = isNew ? DRAFT_KEY_NEW(userId) : DRAFT_KEY_REC(sampleId, userId)
    const draftRaw  = localStorage.getItem(draftKey)
    let draft = null
    try { if (draftRaw) draft = JSON.parse(draftRaw) } catch {}

    container.innerHTML = isNew
      ? this._newSampleHtml(sites, draft)
      : this._recordHtml(sample, sites, draft)

    this._bindAutosave(container, draftKey, isNew)
    this._bindSubmit(container, isNew, sampleId, sites, sample, userId, supabase, draftKey)
  }

  // ─── 新建样本表单 ────────────────────────────────────────────────────────────
  _newSampleHtml(sites, draft) {
    const f = draft?.form ?? {}
    return `<div class="max-w-2xl fade-in">
      <div class="mb-6">
        <button id="back-btn" class="text-sm text-gray-400 hover:text-gray-600 mb-1 block">← 样本台账</button>
        <h1 class="text-xl font-semibold text-gray-900">新建样本</h1>
        <p class="text-sm text-gray-500 mt-0.5">创建后可继续录入检测记录</p>
      </div>
      ${draft ? `<div class="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex justify-between">
        <span>已恢复上次草稿</span>
        <button id="clear-draft" class="underline">清空</button>
      </div>` : ''}
      <form id="main-form" class="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">样本编号 <span class="text-red-500">*</span></label>
            <input name="id" required value="${this._esc(f.id ?? '')}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">样本类型 <span class="text-red-500">*</span></label>
            <input name="sample_type" required value="${this._esc(f.sample_type ?? '')}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">采样日期</label>
            <input name="collection_date" type="date" value="${this._esc(f.collection_date ?? '')}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">送检日期</label>
            <input name="submission_date" type="date" value="${this._esc(f.submission_date ?? '')}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">来源</label>
            <input name="sample_source" value="${this._esc(f.sample_source ?? '')}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
        <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
        <div class="flex gap-3">
          <button type="submit" id="submit-btn"
            class="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            创建样本
          </button>
        </div>
      </form>
    </div>`
  }

  // ─── 检测记录表单 ─────────────────────────────────────────────────────────────
  _recordHtml(sample, sites, draft) {
    const siteId = draft?.siteId ?? sites[0]?.id ?? ''
    const remark = draft?.remark ?? ''
    const items  = draft?.items ?? [defaultItem()]

    return `<div class="max-w-2xl fade-in">
      <div class="mb-6">
        <button id="back-btn" class="text-sm text-gray-400 hover:text-gray-600 mb-1 block">← ${this._esc(sample.id)}</button>
        <h1 class="text-xl font-semibold text-gray-900">新增检测记录</h1>
        <p class="text-sm text-gray-500 mt-0.5">录入后将生成新版本并自动重算比对结果</p>
      </div>
      ${draft ? `<div class="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex justify-between">
        <span>已恢复上次草稿</span>
        <button id="clear-draft" class="underline">清空</button>
      </div>` : ''}
      <form id="main-form" class="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <!-- 站点 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">检测站点 <span class="text-red-500">*</span></label>
          <select name="site_id" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            ${sites.map((s) => `<option value="${s.id}" ${s.id === siteId ? 'selected' : ''}>${this._esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <!-- 备注 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
          <input name="remark" type="text" value="${this._esc(remark)}" placeholder="可选"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <!-- 检测项目 -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-gray-700">检测项目 <span class="text-red-500">*</span></label>
            <button type="button" id="add-item"
              class="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 px-2.5 py-1 rounded-lg transition-colors">
              + 添加项目
            </button>
          </div>
          <div id="items-container" class="space-y-3">
            ${items.map((item, i) => this._itemRow(item, i)).join('')}
          </div>
        </div>
        <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
        <button type="submit" id="submit-btn"
          class="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
          保存并生成版本
        </button>
      </form>
    </div>`
  }

  _itemRow(item, i) {
    return `<div class="item-row border border-gray-200 rounded-lg p-3 space-y-2" data-index="${i}">
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500 font-medium">项目 ${i + 1}</span>
        <button type="button" class="remove-item text-xs text-red-400 hover:text-red-600">移除</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-gray-500 mb-0.5">项目名称 *</label>
          <input name="project_name" value="${this._esc(item.project_name)}" required
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-0.5">Ct 值</label>
          <input name="ct_value" type="text" value="${this._esc(String(item.ct_value ?? ''))}"
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-0.5">原始文本</label>
          <input name="raw_text" value="${this._esc(item.raw_text)}"
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-0.5">结论</label>
          <input name="conclusion" value="${this._esc(item.conclusion)}"
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
      </div>
      <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" name="is_missing" ${item.is_missing ? 'checked' : ''} class="accent-blue-600">
        标记为缺失数据
      </label>
    </div>`
  }

  // ─── 自动保存草稿 ───────────────────────────────────────────────────────────
  _bindAutosave(container, draftKey, isNew) {
    const form = container.querySelector('#main-form')
    if (!form) return

    const save = () => {
      clearTimeout(this._draftTimer)
      this._draftTimer = setTimeout(() => {
        try {
          if (isNew) {
            const fd = new FormData(form)
            localStorage.setItem(draftKey, JSON.stringify({
              form: Object.fromEntries(fd.entries()),
              updatedAt: Date.now(),
            }))
          } else {
            const fd   = new FormData(form)
            const rows = container.querySelectorAll('.item-row')
            const items = [...rows].map((row) => ({
              project_name: row.querySelector('[name=project_name]')?.value ?? '',
              ct_value:     row.querySelector('[name=ct_value]')?.value ?? '',
              raw_text:     row.querySelector('[name=raw_text]')?.value ?? '',
              conclusion:   row.querySelector('[name=conclusion]')?.value ?? '',
              is_missing:   row.querySelector('[name=is_missing]')?.checked ?? false,
            }))
            localStorage.setItem(draftKey, JSON.stringify({
              siteId: fd.get('site_id'),
              remark: fd.get('remark'),
              items,
              updatedAt: Date.now(),
            }))
          }
        } catch {}
      }, 500)
    }

    form.addEventListener('input', save)
    form.addEventListener('change', save)

    container.querySelector('#clear-draft')?.addEventListener('click', () => {
      localStorage.removeItem(draftKey)
      container.querySelector('.mb-4')?.remove()
    })
  }

  // ─── 提交逻辑 ───────────────────────────────────────────────────────────────
  _bindSubmit(container, isNew, sampleId, sites, sample, userId, supabase, draftKey) {
    // 动态增删检测项目行（仅检测记录表单）
    if (!isNew) {
      container.querySelector('#add-item')?.addEventListener('click', () => {
        const itemsContainer = container.querySelector('#items-container')
        const idx = itemsContainer.querySelectorAll('.item-row').length
        const el = document.createElement('div')
        el.innerHTML = this._itemRow(defaultItem(), idx)
        const row = el.firstElementChild
        row.querySelector('.remove-item').addEventListener('click', () => row.remove())
        itemsContainer.appendChild(row)
      })

      container.querySelectorAll('.remove-item').forEach((btn) => {
        btn.addEventListener('click', () => btn.closest('.item-row').remove())
      })
    }

    // 回退按钮
    container.querySelector('#back-btn')?.addEventListener('click', () => {
      if (sampleId) router.go(`/sample?id=${sampleId}`)
      else router.go('/samples')
    })

    const form   = container.querySelector('#main-form')
    const btn    = container.querySelector('#submit-btn')
    const errEl  = container.querySelector('#form-error')

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      errEl.classList.add('hidden')
      btn.disabled = true
      btn.textContent = '提交中…'

      try {
        if (isNew) {
          await this._submitNewSample(form, supabase, userId, draftKey)
        } else {
          await this._submitRecord(form, container, sampleId, userId, supabase, draftKey)
        }
      } catch (err) {
        errEl.textContent = err.message || '提交失败'
        errEl.classList.remove('hidden')
        btn.disabled = false
        btn.textContent = isNew ? '创建样本' : '保存并生成版本'
      }
    })
  }

  async _submitNewSample(form, supabase, userId, draftKey) {
    const fd = new FormData(form)
    const id = fd.get('id')?.trim()
    if (!id) throw new Error('样本编号不能为空')

    const { error } = await supabase.from('samples').insert({
      id,
      sample_type:     fd.get('sample_type')?.trim() || null,
      sample_source:   fd.get('sample_source')?.trim() || null,
      collection_date: fd.get('collection_date') || null,
      submission_date: fd.get('submission_date') || null,
    })
    if (error) throw error

    localStorage.removeItem(draftKey)
    showToast('样本已创建', 'success')
    router.go(`/sample?id=${encodeURIComponent(id)}`)
  }

  async _submitRecord(form, container, sampleId, userId, supabase, draftKey) {
    const fd      = new FormData(form)
    const siteId  = fd.get('site_id')
    const remark  = fd.get('remark')?.trim() || null

    const rows     = container.querySelectorAll('.item-row')
    const allItems = [...rows].map((row) => ({
      project_name: row.querySelector('[name=project_name]')?.value.trim() ?? '',
      ct_value:     row.querySelector('[name=ct_value]')?.value.trim() ?? '',
      raw_text:     row.querySelector('[name=raw_text]')?.value.trim() ?? '',
      conclusion:   row.querySelector('[name=conclusion]')?.value.trim() ?? '',
      is_missing:   row.querySelector('[name=is_missing]')?.checked ?? false,
    }))
    const validItems = allItems.filter((i) => i.project_name)
    if (validItems.length === 0) throw new Error('请至少填写一个检测项目')

    // 1. 创建检测记录
    const { data: record, error: recErr } = await supabase
      .from('detection_records')
      .insert({ sample_id: sampleId, site_id: siteId, source_type: 'MANUAL', operator_id: userId, remark })
      .select('id').single()
    if (recErr || !record) throw new Error(recErr?.message ?? '创建检测记录失败')

    // 2. 写入检测项目
    const itemsToInsert = validItems.map((item) => ({
      record_id:    record.id,
      project_name: item.project_name,
      ct_value:     item.is_missing ? null : (parseFloat(item.ct_value) || null),
      raw_text:     item.raw_text || null,
      conclusion:   item.conclusion || null,
      is_missing:   item.is_missing,
    }))
    const { error: itemsErr } = await supabase.from('detection_items').insert(itemsToInsert)
    if (itemsErr) throw itemsErr

    // 3. 计算版本号
    const { data: existingVersions } = await supabase
      .from('versions').select('version_no').eq('record_id', record.id)
      .order('version_no', { ascending: false }).limit(1)
    const newVersionNo = (existingVersions?.[0]?.version_no ?? 0) + 1

    // 4. 旧版本设为非最新
    await supabase.from('versions').update({ is_latest: false }).eq('record_id', record.id).eq('is_latest', true)

    // 5. 创建新版本
    const { data: version, error: verErr } = await supabase
      .from('versions')
      .insert({ sample_id: sampleId, record_id: record.id, version_no: newVersionNo,
        action_type: 'CREATE', operator_id: userId, note: remark, is_latest: true, is_final: false })
      .select('id').single()
    if (verErr || !version) throw new Error(verErr?.message ?? '创建版本失败')

    // 6. 版本快照
    await supabase.from('version_snapshots').insert(
      itemsToInsert.map((item) => ({
        version_id:   version.id,
        project_name: item.project_name,
        ct_value:     item.ct_value,
        raw_text:     item.raw_text,
        conclusion:   item.conclusion,
        is_missing:   item.is_missing,
      }))
    )

    // 7. 触发比对
    await triggerCompare(sampleId).catch((e) => console.warn('compare skipped:', e.message))

    localStorage.removeItem(draftKey)
    showToast('已保存并生成新版本', 'success')
    router.go(`/sample?id=${encodeURIComponent(sampleId)}`)
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
