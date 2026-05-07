/**
 * Comparison - Ct 数据对比工作台
 * 按照原型实现完整 6 步流程：
 *  01. Excel 导入（迪奇 + 客户科艺普）
 *  02. 手动新增（单条 + 批量粘贴）
 *  03. 客户数据字段映射（条件显示）
 *  04. 标准化数据编辑（可内联编辑的双方表格）
 *  05. 靶标名称统一（可编辑映射表）
 *  06. 对比结果（统计卡片 / 筛选 / 颜色行 / 导出 CSV）
 */

const DEFAULT_TARGET_ALIAS = {
  'HLV-FAM':'HLV','HLV-HEX':'HLV','HLV':'HLV',
  'DIV1':'DIV1','SHIV/DIV1':'DIV1','SHIV-DIV1':'DIV1',
  'WSSV':'WSSV','VP':'VP','EHP':'EHP','VNNV':'VNNV',
  'LMBV':'LMBV','ISKNV':'ISKNV','SCRV':'SCRV',
  'ED':'Ed','Ed':'Ed','CPI':'CPI',
  'NOCAR':'Nocar','Nocar':'Nocar',
  'STI':'StI','StI':'StI',
  'VH':'VH','IMNV':'IMNV','AHPND':'AHPND',
}

const STANDARD_FIELDS = [
  { key:'sample_id',  label:'样本编号',    required:true,  desc:'用于对比合并的主编号。' },
  { key:'sample_type',label:'样本类型',    required:false, desc:'可选，用于辅助查看。' },
  { key:'target',     label:'靶标',        required:true,  desc:'客户原始靶标或检测项目名称。' },
  { key:'keyup_ct_1', label:'科艺普 Ct 1', required:false, desc:'客户第一次或主要 Ct 值。' },
  { key:'keyup_ct_2', label:'科艺普 Ct 2', required:false, desc:'客户复测、重新上机或其他 Ct 值。' },
  { key:'keyup_ct_3', label:'科艺普 Ct 3', required:false, desc:'客户第三个 Ct 值，可选。' },
  { key:'remark',     label:'备注',        required:false, desc:'可选备注。' },
]

const MISSING_TEXTS = new Set([
  '-','/',  '／','—','未测','未检测','未检出','阴性','无ct','noct',
  'no ct','not detected','ntc','n/a','na','null','none',
])

export class ComparisonModule {
  constructor() {
    this._diqiData      = []
    this._customerRaw   = []
    this._customerHeaders = []
    this._customerData  = []
    this._targetMap     = {}
    this._comparisonRows = []
    this._currentFilter = 'all'
    this._container     = null
  }

  render(container) {
    this._container     = container
    this._diqiData      = []
    this._customerRaw   = []
    this._customerHeaders = []
    this._customerData  = []
    this._targetMap     = {}
    this._comparisonRows = []
    this._currentFilter = 'all'

    container.innerHTML = this._buildHtml()
    this._bind()
    this._renderEditableTables()
    this._buildTargetMapTable()
    this._renderStats()
    this._renderComparisonTable()
  }

  // ─── Main HTML ───────────────────────────────────────────────────────────────
  _buildHtml() {
    return `<div class="comp-root fade-in">

    <!-- 01 导入 -->
    <div class="comp-section">
      <div class="comp-section-header">
        <span class="comp-step-badge">01</span>
        <h2>数据导入</h2>
      </div>
      <div class="comp-grid-2">
        <div class="comp-upload-box">
          <strong>迪奇内部数据（标准模板）</strong>
          <input type="file" id="comp-diqi-file" accept=".xlsx,.xls,.csv">
          <p class="comp-small">自动识别字段：样本编号、样本类型、靶标、迪奇1批-R1 Ct、迪奇1批-R2 Ct、迪奇2批-R1 Ct、迪奇2批-R2 Ct、备注/结论。</p>
        </div>
        <div class="comp-upload-box">
          <strong>客户科艺普数据（原始 Excel + 手动映射）</strong>
          <input type="file" id="comp-customer-file" accept=".xlsx,.xls,.csv">
          <p class="comp-small">上传后先预览原始数据，再把客户 Excel 中的列对应到系统字段。支持二次编辑。</p>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="comp-btn-demo" class="comp-btn">加载示例数据</button>
        <button id="comp-btn-clear" class="comp-btn-ghost">清空全部数据</button>
      </div>
    </div>

    <!-- 02 手动新增 -->
    <div class="comp-section">
      <div class="comp-section-header">
        <span class="comp-step-badge">02</span>
        <h2>手动新增数据</h2>
      </div>
      <div class="comp-info-banner">
        除 Excel 导入外，可在此处手动新增单条数据，或从 Excel 中批量复制多行粘贴。新增后会自动进入标准化数据表，并可继续编辑。
      </div>
      <div class="comp-grid-2">
        <div class="comp-panel">
          <h3>单条新增</h3>
          <div class="comp-grid-4">
            <div>
              <label>数据来源</label>
              <select id="comp-manual-source"><option value="diqi">迪奇</option><option value="customer">科艺普</option></select>
            </div>
            <div><label>样本编号</label><input type="text" id="comp-manual-sid" placeholder="如 LZ202603399"></div>
            <div><label>样本类型</label><input type="text" id="comp-manual-stype" placeholder="如 成虾/鲈鱼"></div>
            <div><label>靶标</label><input type="text" id="comp-manual-target" placeholder="如 VP/EHP/HLV"></div>
            <div><label>Ct1</label><input type="text" id="comp-manual-ct1" placeholder="如 29.35"></div>
            <div><label>Ct2</label><input type="text" id="comp-manual-ct2" placeholder="可空"></div>
            <div><label>Ct3</label><input type="text" id="comp-manual-ct3" placeholder="可空"></div>
            <div><label>Ct4</label><input type="text" id="comp-manual-ct4" placeholder="可空"></div>
          </div>
          <div style="margin-top:10px;">
            <label>备注</label>
            <input type="text" id="comp-manual-remark" placeholder="复测、批次、异常说明等">
          </div>
          <div style="margin-top:10px;">
            <button id="comp-btn-add-single" class="comp-btn">新增到标准数据表</button>
            <button id="comp-btn-clear-single" class="comp-btn-ghost">清空录入框</button>
          </div>
        </div>
        <div class="comp-panel">
          <h3>批量粘贴新增</h3>
          <p class="comp-small">从 Excel 中复制多行后直接粘贴。默认列顺序：样本编号、样本类型、靶标、Ct1、Ct2、Ct3、Ct4、备注。</p>
          <div class="comp-grid-2" style="gap:8px;">
            <div>
              <label>数据来源</label>
              <select id="comp-bulk-source"><option value="diqi">迪奇</option><option value="customer">科艺普</option></select>
            </div>
            <div>
              <label>是否跳过首行</label>
              <select id="comp-bulk-skip"><option value="no">否</option><option value="yes">是（首行为表头）</option></select>
            </div>
          </div>
          <div style="margin-top:10px;">
            <label>粘贴数据</label>
            <textarea id="comp-bulk-text" placeholder="样本编号&#9;样本类型&#9;靶标&#9;Ct1&#9;Ct2&#9;Ct3&#9;Ct4&#9;备注"></textarea>
          </div>
          <div style="margin-top:10px;">
            <button id="comp-btn-add-bulk" class="comp-btn">批量新增</button>
            <button id="comp-btn-clear-bulk" class="comp-btn-ghost">清空文本</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 03 客户字段映射（条件显示） -->
    <div id="comp-section-mapping" class="comp-section" style="display:none;">
      <div class="comp-section-header">
        <span class="comp-step-badge">03</span>
        <h2>客户数据字段映射</h2>
      </div>
      <div class="comp-info-banner">
        客户 Excel 的列名、位置可能不固定。请在此处指定每个系统字段对应客户 Excel 中的哪一列。
        如果某项没有对应列，可以选择"不映射"。系统会对空白样本编号和样本类型做向下填充。
      </div>
      <h3 style="font-size:15px;margin:0 0 8px;">客户原始数据预览</h3>
      <div id="comp-customer-raw-preview" class="comp-raw-preview"></div>
      <h3 style="font-size:15px;margin:14px 0 8px;">字段映射</h3>
      <div class="comp-table-wrap" style="max-height:none;">
        <table class="comp-map-table">
          <thead><tr><th>系统字段</th><th>客户 Excel 字段</th><th>说明</th></tr></thead>
          <tbody id="comp-mapping-body"></tbody>
        </table>
      </div>
      <button id="comp-btn-apply-mapping" class="comp-btn" style="margin-top:10px;">生成客户标准数据</button>
    </div>

    <!-- 04 标准化数据编辑 -->
    <div class="comp-section">
      <div class="comp-section-header">
        <span class="comp-step-badge">04</span>
        <h2>标准化数据编辑</h2>
      </div>
      <div class="comp-grid-2">
        <div>
          <h3 style="font-size:15px;margin:0 0 8px;">迪奇标准数据</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <button id="comp-btn-add-diqi" class="comp-btn">新增空行</button>
            <button id="comp-btn-refresh-diqi" class="comp-btn-secondary">刷新</button>
          </div>
          <div id="comp-diqi-table" class="comp-table-wrap"></div>
        </div>
        <div>
          <h3 style="font-size:15px;margin:0 0 8px;">科艺普标准数据</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <button id="comp-btn-add-customer" class="comp-btn">新增空行</button>
            <button id="comp-btn-refresh-customer" class="comp-btn-secondary">刷新</button>
          </div>
          <div id="comp-customer-table" class="comp-table-wrap"></div>
        </div>
      </div>
    </div>

    <!-- 05 靶标统一 -->
    <div class="comp-section">
      <div class="comp-section-header">
        <span class="comp-step-badge">05</span>
        <h2>靶标名称统一</h2>
      </div>
      <p class="comp-small" style="margin-bottom:10px;">
        系统会从两方标准数据中提取所有靶标，并按默认字典进行初步统一。您可以手动修改"标准靶标"后重新对比。
      </p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <button id="comp-btn-rebuild-targets" class="comp-btn">识别/刷新靶标</button>
        <button id="comp-btn-run-compare" class="comp-btn">应用靶标统一并对比</button>
      </div>
      <div id="comp-target-map-table" class="comp-table-wrap"></div>
    </div>

    <!-- 06 对比结果 -->
    <div class="comp-section">
      <div class="comp-section-header">
        <span class="comp-step-badge">06</span>
        <h2>对比结果</h2>
      </div>
      <div class="comp-stats" id="comp-stats-box">
        ${['对比项','单方有 Ct','Ct 差异较大','Ct 差异显著','复测波动较大','双方未测'].map(l =>
          `<div class="comp-stat-card"><div class="comp-stat-label">${l}</div><div class="comp-stat-value">0</div></div>`
        ).join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px;">
        <button class="comp-filter-btn comp-filter-active" data-filter="all">全部</button>
        <button class="comp-filter-btn" data-filter="single">只看单方有 Ct</button>
        <button class="comp-filter-btn" data-filter="large">只看 Ct 差异较大</button>
        <button class="comp-filter-btn" data-filter="significant">只看 Ct 差异显著</button>
        <button class="comp-filter-btn" data-filter="fluctuation">只看复测波动较大</button>
        <button id="comp-btn-recompute" class="comp-btn-secondary">重新计算</button>
        <button id="comp-btn-export-result" class="comp-btn">导出对比结果 CSV</button>
        <button id="comp-btn-export-std" class="comp-btn">导出标准化数据 CSV</button>
      </div>
      <div id="comp-comparison-table" class="comp-table-wrap"></div>
    </div>

    </div>`
  }

  // ─── Bind events ─────────────────────────────────────────────────────────────
  _bind() {
    const C  = this._container
    const $  = (id) => C.querySelector(id)

    // 01 文件上传
    $('#comp-diqi-file').addEventListener('change', (e) => {
      const f = e.target.files?.[0]; if (f) this._handleDiqiFile(f)
    })
    $('#comp-customer-file').addEventListener('change', (e) => {
      const f = e.target.files?.[0]; if (f) this._handleCustomerFile(f)
    })
    $('#comp-btn-demo').addEventListener('click',  () => this._loadDemoData())
    $('#comp-btn-clear').addEventListener('click', () => this._clearAll())

    // 02 手动新增
    $('#comp-btn-add-single').addEventListener('click',  () => this._addManualSingle())
    $('#comp-btn-clear-single').addEventListener('click', () => this._clearManualForm())
    $('#comp-btn-add-bulk').addEventListener('click',    () => this._addBulkRows())
    $('#comp-btn-clear-bulk').addEventListener('click',  () => { $('#comp-bulk-text').value = '' })

    // 03 映射
    $('#comp-btn-apply-mapping').addEventListener('click', () => this._generateCustomerStandardData())

    // 04 表格
    $('#comp-btn-add-diqi').addEventListener('click', () => {
      this._addEmptyRow('diqi'); this._renderEditableTables()
    })
    $('#comp-btn-add-customer').addEventListener('click', () => {
      this._addEmptyRow('customer'); this._renderEditableTables()
    })
    $('#comp-btn-refresh-diqi').addEventListener('click',     () => this._renderEditableTables())
    $('#comp-btn-refresh-customer').addEventListener('click', () => this._renderEditableTables())

    // 05 靶标
    $('#comp-btn-rebuild-targets').addEventListener('click', () => this._buildTargetMapTable())
    $('#comp-btn-run-compare').addEventListener('click',     () => this._runComparison())

    // 06 筛选 & 导出
    C.querySelectorAll('.comp-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._currentFilter = btn.dataset.filter
        C.querySelectorAll('.comp-filter-btn').forEach(b => b.classList.remove('comp-filter-active'))
        btn.classList.add('comp-filter-active')
        this._renderComparisonTable()
      })
    })
    $('#comp-btn-recompute').addEventListener('click',     () => this._runComparison())
    $('#comp-btn-export-result').addEventListener('click', () => this._exportComparisonCSV())
    $('#comp-btn-export-std').addEventListener('click',    () => this._exportStandardCSV())
  }

  // ─── File handling ────────────────────────────────────────────────────────────
  async _handleDiqiFile(file) {
    try {
      const rows = await this._readExcel(file)
      this._diqiData = this._parseDiqiStandard(rows)
      this._afterDataChanged()
      this._showToast(`迪奇数据已导入，共 ${this._diqiData.length} 行`, 'success')
    } catch (e) {
      this._showToast('迪奇文件解析失败：' + e.message, 'error')
    }
  }

  async _handleCustomerFile(file) {
    try {
      const rows = await this._readExcel(file)
      const normalized = this._normalizeRows(rows)
      this._prepareCustomerMapping(normalized)
      this._showToast('客户文件已加载，请完成字段映射后点击"生成客户标准数据"', 'info')
    } catch (e) {
      this._showToast('客户文件解析失败：' + e.message, 'error')
    }
  }

  _readExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const XLSX = window.XLSX
          const wb   = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' })
          const sheet = wb.Sheets[wb.SheetNames[0]]
          resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }))
        } catch (e) { reject(e) }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  _normalizeRows(rows) {
    return rows
      .filter(r => r?.some(c => String(c).trim() !== ''))
      .map(r => r.map(c => String(c ?? '').trim()))
  }

  _findHeaderRow(rows) {
    const kws = ['样本','编号','靶标','项目','CT','Ct','检测','类别','类型','结果']
    let bestIdx = 0, bestScore = -1
    rows.slice(0, 20).forEach((row, idx) => {
      const text = row.join('|')
      let score = 0
      kws.forEach(k => { if (text.includes(k)) score++ })
      if (score > bestScore) { bestScore = score; bestIdx = idx }
    })
    return bestIdx
  }

  _findColumn(headers, keywords) {
    const norm = h => String(h).replace(/\s+/g, '').toLowerCase()
    const normalized = headers.map(h => norm(h))
    for (const kw of keywords) {
      const k   = norm(kw)
      const idx = normalized.findIndex(h => h.includes(k))
      if (idx >= 0) return idx
    }
    return -1
  }

  _parseDiqiStandard(rows) {
    const clean = this._normalizeRows(rows)
    if (!clean.length) return []
    const headerIdx = this._findHeaderRow(clean)
    const headers   = clean[headerIdx].map(h => String(h).trim())
    const dataRows  = clean.slice(headerIdx + 1)

    const col = {
      sample_id:   this._findColumn(headers, ['样本编号','检测编号','编号']),
      sample_type: this._findColumn(headers, ['样本类型','检测类别','类型']),
      target:      this._findColumn(headers, ['靶标','检测项目','项目']),
      d1r1:        this._findColumn(headers, ['迪奇1批-R1','迪奇1批R1','1批-R1','R1 Ct','R1Ct']),
      d1r2:        this._findColumn(headers, ['迪奇1批-R2','迪奇1批R2','1批-R2','R2 Ct','R2Ct']),
      d2r1:        this._findColumn(headers, ['迪奇2批-R1','迪奇2批R1','2批-R1']),
      d2r2:        this._findColumn(headers, ['迪奇2批-R2','迪奇2批R2','2批-R2']),
      remark:      this._findColumn(headers, ['备注','结论']),
    }

    let lastSample = '', lastType = ''
    const result = []
    dataRows.forEach(row => {
      const sampleRaw = this._cell(row, col.sample_id)
      const typeRaw   = this._cell(row, col.sample_type)
      const sampleId  = sampleRaw || lastSample
      const sampleType = typeRaw  || lastType
      const target    = this._cell(row, col.target)
      if (sampleRaw) lastSample = sampleRaw
      if (typeRaw)   lastType   = typeRaw
      if (!sampleId || !target) return
      result.push({
        sample_id:   sampleId,
        sample_type: sampleType,
        target,
        diqi_ct_1: this._cell(row, col.d1r1),
        diqi_ct_2: this._cell(row, col.d1r2),
        diqi_ct_3: this._cell(row, col.d2r1),
        diqi_ct_4: this._cell(row, col.d2r2),
        remark:    this._cell(row, col.remark),
      })
    })
    return result
  }

  _cell(row, idx) {
    if (idx === undefined || idx < 0) return ''
    return String(row[idx] ?? '').trim()
  }

  // ─── Customer mapping ─────────────────────────────────────────────────────────
  _prepareCustomerMapping(rows) {
    if (!rows?.length) return
    const headerIdx = this._findHeaderRow(rows)
    this._customerHeaders = rows[headerIdx].map((h, i) => String(h || `空列${i + 1}`).trim())
    this._customerRaw     = rows.slice(headerIdx + 1)

    const section = this._container.querySelector('#comp-section-mapping')
    section.style.display = 'block'
    this._renderCustomerRawPreview(rows, headerIdx)
    this._renderMappingSelects()
  }

  _renderCustomerRawPreview(rows, headerIdx) {
    const maxRows = Math.min(rows.length, 30)
    let html = '<table><thead><tr>'
    rows[headerIdx].forEach(h => { html += `<th>${this._esc(h)}</th>` })
    html += '</tr></thead><tbody>'
    for (let i = headerIdx + 1; i < maxRows; i++) {
      html += '<tr>'
      rows[i].forEach(c => { html += `<td>${this._esc(c)}</td>` })
      html += '</tr>'
    }
    html += '</tbody></table>'
    this._container.querySelector('#comp-customer-raw-preview').innerHTML = html
  }

  _guessCustomerCol(key) {
    const map = {
      sample_id:   ['样本编号','检测编号','编号'],
      sample_type: ['样本类型','检测类别','类型'],
      target:      ['检测项目','靶标','项目'],
      keyup_ct_1:  ['检测结果/CT值','检测结果','CT值','Ct值'],
      keyup_ct_2:  ['重新上机','复测','自动提取'],
      keyup_ct_3:  ['重新提取','重提取'],
      remark:      ['备注','说明'],
    }
    const idx = this._findColumn(this._customerHeaders, map[key] || [])
    return String(idx >= 0 ? idx : -1)
  }

  _renderMappingSelects() {
    const body    = this._container.querySelector('#comp-mapping-body')
    const headers = this._customerHeaders
    body.innerHTML = ''
    STANDARD_FIELDS.forEach(f => {
      const tr = document.createElement('tr')
      let opts = '<option value="-1">不映射</option>'
      headers.forEach((h, i) => { opts += `<option value="${i}">${i + 1}. ${this._esc(h)}</option>` })
      const guessed = this._guessCustomerCol(f.key)
      tr.innerHTML = `
        <td>${f.label}${f.required ? " <span style='color:#dc2626'>*</span>" : ''}</td>
        <td><select id="comp-map-${f.key}" style="width:100%;">${opts}</select></td>
        <td class="comp-small">${f.desc}</td>`
      body.appendChild(tr)
      tr.querySelector(`#comp-map-${f.key}`).value = guessed
    })
  }

  _generateCustomerStandardData() {
    const idx = {}
    STANDARD_FIELDS.forEach(f => {
      idx[f.key] = Number(this._container.querySelector(`#comp-map-${f.key}`)?.value ?? -1)
    })

    let lastSample = '', lastType = ''
    this._customerData = []
    this._customerRaw.forEach(row => {
      const sr = this._cell(row, idx.sample_id)
      const tr = this._cell(row, idx.sample_type)
      const sampleId   = sr || lastSample
      const sampleType = tr || lastType
      const target     = this._cell(row, idx.target)
      if (sr) lastSample = sr
      if (tr) lastType   = tr
      if (!sampleId && !target) return
      if (!target) return
      this._customerData.push({
        sample_id:   sampleId,
        sample_type: sampleType,
        target,
        keyup_ct_1: this._cell(row, idx.keyup_ct_1),
        keyup_ct_2: this._cell(row, idx.keyup_ct_2),
        keyup_ct_3: this._cell(row, idx.keyup_ct_3),
        remark:     this._cell(row, idx.remark),
      })
    })

    this._afterDataChanged()
    this._showToast(`客户标准数据已生成，共 ${this._customerData.length} 行`, 'success')
  }

  // ─── Manual entry ─────────────────────────────────────────────────────────────
  _addManualSingle() {
    const C = this._container
    const g = (id) => C.querySelector(id)?.value?.trim() || ''
    const source = C.querySelector('#comp-manual-source')?.value || 'diqi'
    const row = {
      sample_id:   g('#comp-manual-sid'),
      sample_type: g('#comp-manual-stype'),
      target:      g('#comp-manual-target'),
      ct1: g('#comp-manual-ct1'), ct2: g('#comp-manual-ct2'),
      ct3: g('#comp-manual-ct3'), ct4: g('#comp-manual-ct4'),
      remark: g('#comp-manual-remark'),
    }
    if (!row.sample_id || !row.target) {
      this._showToast('样本编号和靶标为必填项', 'error'); return
    }
    this._pushRow(source, row)
    this._clearManualForm()
    this._afterDataChanged()
    this._showToast('已新增 1 行', 'success')
  }

  _clearManualForm() {
    const C = this._container
    ;['#comp-manual-sid','#comp-manual-stype','#comp-manual-target',
      '#comp-manual-ct1','#comp-manual-ct2','#comp-manual-ct3',
      '#comp-manual-ct4','#comp-manual-remark'].forEach(id => {
      const el = C.querySelector(id); if (el) el.value = ''
    })
  }

  _addBulkRows() {
    const C      = this._container
    const source = C.querySelector('#comp-bulk-source')?.value || 'diqi'
    const skipHdr = C.querySelector('#comp-bulk-skip')?.value === 'yes'
    const text   = C.querySelector('#comp-bulk-text')?.value?.trim() || ''
    if (!text) { this._showToast('请先粘贴需要批量新增的数据', 'error'); return }

    let lines = text.split(/\r?\n/).filter(l => l.trim())
    if (skipHdr) lines = lines.slice(1)

    let added = 0
    lines.forEach(line => {
      const parts = this._splitLine(line)
      const row = {
        sample_id:   parts[0] || '', sample_type: parts[1] || '', target: parts[2] || '',
        ct1: parts[3] || '', ct2: parts[4] || '', ct3: parts[5] || '',
        ct4: parts[6] || '', remark: parts.slice(7).join(' ') || '',
      }
      if (!row.sample_id || !row.target) return
      this._pushRow(source, row)
      added++
    })
    this._afterDataChanged()
    this._showToast(`已新增 ${added} 行`, 'success')
  }

  _splitLine(line) {
    if (line.includes('\t')) return line.split('\t').map(x => x.trim())
    if (line.includes(','))  return line.split(',').map(x => x.trim())
    return line.split(/\s{2,}/).map(x => x.trim())
  }

  _pushRow(source, row) {
    if (source === 'diqi') {
      this._diqiData.push({
        sample_id: row.sample_id, sample_type: row.sample_type, target: row.target,
        diqi_ct_1: row.ct1, diqi_ct_2: row.ct2, diqi_ct_3: row.ct3, diqi_ct_4: row.ct4, remark: row.remark,
      })
    } else {
      this._customerData.push({
        sample_id: row.sample_id, sample_type: row.sample_type, target: row.target,
        keyup_ct_1: row.ct1, keyup_ct_2: row.ct2, keyup_ct_3: row.ct3,
        remark: [row.ct4 ? `Ct4:${row.ct4}` : '', row.remark].filter(Boolean).join('；'),
      })
    }
  }

  // ─── Editable tables ──────────────────────────────────────────────────────────
  _addEmptyRow(type) {
    if (type === 'diqi') {
      this._diqiData.push({ sample_id:'', sample_type:'', target:'', diqi_ct_1:'', diqi_ct_2:'', diqi_ct_3:'', diqi_ct_4:'', remark:'' })
    } else {
      this._customerData.push({ sample_id:'', sample_type:'', target:'', keyup_ct_1:'', keyup_ct_2:'', keyup_ct_3:'', remark:'' })
    }
  }

  _renderEditableTables() {
    this._renderEditableTable('comp-diqi-table', this._diqiData, [
      ['sample_id','样本编号'],['sample_type','样本类型'],['target','靶标'],
      ['diqi_ct_1','迪奇Ct1'],['diqi_ct_2','迪奇Ct2'],['diqi_ct_3','迪奇Ct3'],['diqi_ct_4','迪奇Ct4'],['remark','备注'],
    ], 'diqi')
    this._renderEditableTable('comp-customer-table', this._customerData, [
      ['sample_id','样本编号'],['sample_type','样本类型'],['target','靶标'],
      ['keyup_ct_1','科艺普Ct1'],['keyup_ct_2','科艺普Ct2'],['keyup_ct_3','科艺普Ct3'],['remark','备注'],
    ], 'customer')
  }

  _renderEditableTable(containerId, data, columns, type) {
    const el = this._container.querySelector(`#${containerId}`)
    if (!el) return
    if (!data.length) {
      el.innerHTML = '<div style="padding:12px;color:#9ca3af;font-size:13px;">暂无数据</div>'; return
    }
    let html = '<table class="comp-data-table"><thead><tr>'
    columns.forEach(([, label]) => { html += `<th>${label}</th>` })
    html += '<th>操作</th></tr></thead><tbody>'
    data.forEach((row, ri) => {
      html += '<tr>'
      columns.forEach(([key]) => {
        html += `<td><input type="text" value="${this._esc(row[key] || '')}" data-type="${type}" data-row="${ri}" data-key="${key}"></td>`
      })
      html += `<td><button class="comp-btn-danger comp-btn-sm" data-del-type="${type}" data-del-idx="${ri}">删除</button></td></tr>`
    })
    html += '</tbody></table>'
    el.innerHTML = html

    // 绑定单元格编辑
    el.querySelectorAll('input[data-type]').forEach(input => {
      input.addEventListener('input', () => {
        const arr = input.dataset.type === 'diqi' ? this._diqiData : this._customerData
        if (arr[input.dataset.row]) arr[input.dataset.row][input.dataset.key] = input.value
      })
    })
    // 绑定删除
    el.querySelectorAll('[data-del-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        const arr = btn.dataset.delType === 'diqi' ? this._diqiData : this._customerData
        arr.splice(Number(btn.dataset.delIdx), 1)
        this._afterDataChanged()
      })
    })
  }

  // ─── Target normalization ─────────────────────────────────────────────────────
  _buildTargetMapTable() {
    const targets = new Set()
    ;[...this._diqiData, ...this._customerData].forEach(r => {
      if (r.target) targets.add(String(r.target).trim())
    })
    targets.forEach(t => { if (!this._targetMap[t]) this._targetMap[t] = this._guessTarget(t) })

    const el = this._container.querySelector('#comp-target-map-table')
    if (!el) return
    if (!targets.size) {
      el.innerHTML = '<div style="padding:12px;color:#9ca3af;font-size:13px;">暂无靶标数据，请先导入或录入数据</div>'
      return
    }
    let html = '<table class="comp-data-table" style="min-width:480px;"><thead><tr><th>原始靶标</th><th>标准靶标（可编辑）</th></tr></thead><tbody>'
    Array.from(targets).sort().forEach(t => {
      html += `<tr><td>${this._esc(t)}</td>
        <td><input type="text" class="comp-target-input" data-raw="${this._esc(t)}" value="${this._esc(this._targetMap[t] || t)}"></td></tr>`
    })
    html += '</tbody></table>'
    el.innerHTML = html

    el.querySelectorAll('.comp-target-input').forEach(input => {
      input.addEventListener('input', () => { this._targetMap[input.dataset.raw] = input.value })
    })
  }

  _guessTarget(raw) {
    const t  = String(raw || '').trim()
    if (DEFAULT_TARGET_ALIAS[t]) return DEFAULT_TARGET_ALIAS[t]
    const up = t.toUpperCase()
    if (DEFAULT_TARGET_ALIAS[up]) return DEFAULT_TARGET_ALIAS[up]
    if (up.includes('HLV')) return 'HLV'
    if (up.includes('SHIV') || up.includes('DIV1')) return 'DIV1'
    return t
  }

  _standardTarget(raw) {
    const t = String(raw || '').trim()
    return this._targetMap[t] || this._guessTarget(t)
  }

  // ─── Comparison algorithm ─────────────────────────────────────────────────────
  _runComparison() {
    this._buildTargetMapTable()
    const map = new Map()
    const ensure = (key, base) => {
      if (!map.has(key)) map.set(key, { ...base, keyup_cts: [], diqi_cts: [], keyup_remarks: [], diqi_remarks: [] })
      return map.get(key)
    }

    this._customerData.forEach(row => {
      const sid = String(row.sample_id || '').trim()
      const tgt = this._standardTarget(row.target)
      if (!sid || !tgt) return
      const item = ensure(`${sid}||${tgt}`, { sample_id: sid, sample_type: row.sample_type || '', target: tgt })
      if (!item.sample_type && row.sample_type) item.sample_type = row.sample_type
      item.keyup_cts.push(...this._collectCt(row, ['keyup_ct_1', 'keyup_ct_2', 'keyup_ct_3']))
      if (row.remark) item.keyup_remarks.push(row.remark)
    })

    this._diqiData.forEach(row => {
      const sid = String(row.sample_id || '').trim()
      const tgt = this._standardTarget(row.target)
      if (!sid || !tgt) return
      const item = ensure(`${sid}||${tgt}`, { sample_id: sid, sample_type: row.sample_type || '', target: tgt })
      if (!item.sample_type && row.sample_type) item.sample_type = row.sample_type
      item.diqi_cts.push(...this._collectCt(row, ['diqi_ct_1', 'diqi_ct_2', 'diqi_ct_3', 'diqi_ct_4']))
      if (row.remark) item.diqi_remarks.push(row.remark)
    })

    this._comparisonRows = Array.from(map.values()).map(item => {
      const keyup  = this._unique(item.keyup_cts)
      const diqi   = this._unique(item.diqi_cts)
      const delta  = this._minDelta(keyup, diqi)
      const kFluct = this._fluctuation(keyup)
      const dFluct = this._fluctuation(diqi)
      const status = this._judgeStatus(keyup, diqi, delta, kFluct, dFluct)
      return {
        sample_id:   item.sample_id,
        sample_type: item.sample_type,
        target:      item.target,
        keyup_cts:   keyup,
        diqi_cts:    diqi,
        min_delta:   delta,
        keyup_fluct: kFluct,
        diqi_fluct:  dFluct,
        status:      status.text,
        level:       status.level,
        tags:        status.tags,
        remark:      [...item.keyup_remarks, ...item.diqi_remarks].filter(Boolean).join('；'),
      }
    }).sort((a, b) => {
      const s = a.sample_id.localeCompare(b.sample_id, 'zh-CN')
      return s !== 0 ? s : a.target.localeCompare(b.target, 'zh-CN')
    })

    this._renderStats()
    this._renderComparisonTable()
    this._showToast(`对比完成，共 ${this._comparisonRows.length} 条记录`, 'success')
  }

  _parseCtValues(val) {
    const text = String(val ?? '').trim()
    if (!text) return []
    const lower = text.toLowerCase().replace(/\s+/g, '')
    if (MISSING_TEXTS.has(lower)) return []
    const nums = text.match(/-?\d+(\.\d+)?/g) || []
    return nums.map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 60)
  }

  _collectCt(row, keys) {
    let vals = []
    keys.forEach(k => { vals.push(...this._parseCtValues(row[k])) })
    return vals
  }

  _unique(arr) {
    const rounded = arr.map(n => Number(n.toFixed(2)))
    return Array.from(new Set(rounded)).sort((a, b) => a - b)
  }

  _minDelta(a, b) {
    if (!a.length || !b.length) return null
    let min = Infinity
    a.forEach(x => b.forEach(y => { min = Math.min(min, Math.abs(x - y)) }))
    return Number(min.toFixed(2))
  }

  _fluctuation(arr) {
    if (!arr?.length || arr.length < 2) return null
    return Number((Math.max(...arr) - Math.min(...arr)).toFixed(2))
  }

  _judgeStatus(keyup, diqi, delta, kFluct, dFluct) {
    const hasK  = keyup.length > 0
    const hasD  = diqi.length > 0
    const fluct = (kFluct !== null && kFluct > 2) || (dFluct !== null && dFluct > 2)

    if (!hasK && !hasD) return { text: '双方未测', level: 'gray', tags: ['both_missing'] }
    if (hasK !== hasD) {
      return {
        text:  fluct ? '单方有 Ct；复测波动较大' : '单方有 Ct',
        level: 'red',
        tags:  fluct ? ['single', 'fluctuation'] : ['single'],
      }
    }

    let text = '', level = '', tags = []
    if      (delta <= 1) { text = 'Ct高度接近'; level = 'green';  tags = ['close'] }
    else if (delta <= 3) { text = 'Ct基本接近'; level = 'lime';   tags = ['basic'] }
    else if (delta <= 5) { text = 'Ct差异较大'; level = 'orange'; tags = ['large'] }
    else                 { text = 'Ct差异显著'; level = 'red';    tags = ['significant'] }

    if (fluct) {
      text += '；复测波动较大'
      tags.push('fluctuation')
      if (level === 'green' || level === 'lime') level = 'yellow'
    }
    return { text, level, tags }
  }

  // ─── Render stats & table ─────────────────────────────────────────────────────
  _renderStats() {
    const rows   = this._comparisonRows
    const counts = [
      rows.length,
      rows.filter(r => r.tags.includes('single')).length,
      rows.filter(r => r.tags.includes('large')).length,
      rows.filter(r => r.tags.includes('significant')).length,
      rows.filter(r => r.tags.includes('fluctuation')).length,
      rows.filter(r => r.tags.includes('both_missing')).length,
    ]
    const box = this._container.querySelector('#comp-stats-box')
    if (!box) return
    box.querySelectorAll('.comp-stat-value').forEach((el, i) => { el.textContent = counts[i] })
  }

  _renderComparisonTable() {
    let rows = this._comparisonRows
    if      (this._currentFilter === 'single')      rows = rows.filter(r => r.tags.includes('single'))
    else if (this._currentFilter === 'large')       rows = rows.filter(r => r.tags.includes('large'))
    else if (this._currentFilter === 'significant') rows = rows.filter(r => r.tags.includes('significant'))
    else if (this._currentFilter === 'fluctuation') rows = rows.filter(r => r.tags.includes('fluctuation'))

    const el = this._container.querySelector('#comp-comparison-table')
    if (!el) return
    if (!rows.length) {
      el.innerHTML = '<div style="padding:14px;color:#9ca3af;font-size:13px;">暂无对比数据，请先导入或录入数据后点击"应用靶标统一并对比"</div>'
      return
    }

    const fmtCt = arr => arr?.length
      ? arr.map(n => n.toFixed(2)).join(', ')
      : '<span style="color:#9ca3af;font-style:italic;">未测</span>'

    let html = `<table class="comp-data-table" style="min-width:980px;">
      <thead><tr>
        <th>样本编号</th><th>样本类型</th><th>标准靶标</th>
        <th>科艺普 Ct</th><th>迪奇 Ct</th>
        <th>最小 ΔCt</th><th>科艺普波动</th><th>迪奇波动</th>
        <th>差异提示</th><th>备注</th>
      </tr></thead><tbody>`

    rows.forEach(r => {
      html += `<tr class="comp-row-${r.level}">
        <td class="comp-mono">${this._esc(r.sample_id)}</td>
        <td>${this._esc(r.sample_type)}</td>
        <td>${this._esc(r.target)}</td>
        <td>${fmtCt(r.keyup_cts)}</td>
        <td>${fmtCt(r.diqi_cts)}</td>
        <td>${r.min_delta === null ? '—' : r.min_delta}</td>
        <td>${r.keyup_fluct === null ? '—' : r.keyup_fluct}</td>
        <td>${r.diqi_fluct === null ? '—' : r.diqi_fluct}</td>
        <td><span class="comp-badge comp-badge-${r.level}">${this._esc(r.status)}</span></td>
        <td>${this._esc(r.remark)}</td>
      </tr>`
    })
    html += '</tbody></table>'
    el.innerHTML = html
  }

  // ─── Export ───────────────────────────────────────────────────────────────────
  _exportComparisonCSV() {
    let rows = this._comparisonRows
    if      (this._currentFilter === 'single')      rows = rows.filter(r => r.tags.includes('single'))
    else if (this._currentFilter === 'large')       rows = rows.filter(r => r.tags.includes('large'))
    else if (this._currentFilter === 'significant') rows = rows.filter(r => r.tags.includes('significant'))
    else if (this._currentFilter === 'fluctuation') rows = rows.filter(r => r.tags.includes('fluctuation'))

    const header = ['样本编号','样本类型','标准靶标','科艺普Ct','迪奇Ct','最小ΔCt','科艺普内部波动','迪奇内部波动','差异提示','备注']
    const data   = rows.map(r => [
      r.sample_id, r.sample_type, r.target,
      r.keyup_cts.join(';'), r.diqi_cts.join(';'),
      r.min_delta ?? '', r.keyup_fluct ?? '', r.diqi_fluct ?? '',
      r.status, r.remark,
    ])
    this._downloadCSV('Ct对比结果.csv', [header, ...data])
  }

  _exportStandardCSV() {
    const rows = [['来源','样本编号','样本类型','原始靶标','标准靶标','Ct1','Ct2','Ct3','Ct4','备注']]
    this._customerData.forEach(r => {
      rows.push(['科艺普', r.sample_id, r.sample_type, r.target, this._standardTarget(r.target),
        r.keyup_ct_1, r.keyup_ct_2, r.keyup_ct_3, '', r.remark])
    })
    this._diqiData.forEach(r => {
      rows.push(['迪奇', r.sample_id, r.sample_type, r.target, this._standardTarget(r.target),
        r.diqi_ct_1, r.diqi_ct_2, r.diqi_ct_3, r.diqi_ct_4, r.remark])
    })
    this._downloadCSV('标准化数据.csv', rows)
  }

  _downloadCSV(filename, rows) {
    const csv  = rows.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Demo data ────────────────────────────────────────────────────────────────
  _loadDemoData() {
    this._diqiData = [
      { sample_id:'LZ202603399', sample_type:'成虾',    target:'EHP',     diqi_ct_1:'',      diqi_ct_2:'',      diqi_ct_3:'35.11', diqi_ct_4:'35.86', remark:'' },
      { sample_id:'LZ202603399', sample_type:'成虾',    target:'VP',      diqi_ct_1:'29.98', diqi_ct_2:'',      diqi_ct_3:'29.13', diqi_ct_4:'29.93', remark:'' },
      { sample_id:'LZ202603400', sample_type:'成虾',    target:'VP',      diqi_ct_1:'31.12', diqi_ct_2:'',      diqi_ct_3:'29.71', diqi_ct_4:'29.59', remark:'' },
      { sample_id:'LZ202603404', sample_type:'成虾',    target:'HLV-FAM', diqi_ct_1:'',      diqi_ct_2:'20.85', diqi_ct_3:'18.44', diqi_ct_4:'',      remark:'' },
      { sample_id:'LZ202603409', sample_type:'成虾',    target:'VP',      diqi_ct_1:'20.15', diqi_ct_2:'19.77', diqi_ct_3:'20.36', diqi_ct_4:'20.78', remark:'' },
      { sample_id:'JJ202603193', sample_type:'鲈鱼成鱼',target:'LMBV',    diqi_ct_1:'28.84', diqi_ct_2:'',      diqi_ct_3:'27.19', diqi_ct_4:'28.02', remark:'' },
      { sample_id:'JJ202604019', sample_type:'鲈鱼',    target:'LMBV',    diqi_ct_1:'25.58', diqi_ct_2:'25.58', diqi_ct_3:'25.24', diqi_ct_4:'22.90', remark:'' },
    ]
    this._customerData = [
      { sample_id:'LZ202603399', sample_type:'成虾',    target:'EHP',     keyup_ct_1:'-',    keyup_ct_2:'',     keyup_ct_3:'', remark:'' },
      { sample_id:'LZ202603399', sample_type:'成虾',    target:'VP',      keyup_ct_1:'31.71',keyup_ct_2:'',     keyup_ct_3:'', remark:'' },
      { sample_id:'LZ202603400', sample_type:'成虾',    target:'VP',      keyup_ct_1:'29.37',keyup_ct_2:'',     keyup_ct_3:'', remark:'' },
      { sample_id:'LZ202603404', sample_type:'成虾',    target:'HLV-HEX', keyup_ct_1:'22.81',keyup_ct_2:'28.53',keyup_ct_3:'', remark:'' },
      { sample_id:'LZ202603409', sample_type:'成虾',    target:'VP',      keyup_ct_1:'/',    keyup_ct_2:'',     keyup_ct_3:'', remark:'' },
      { sample_id:'JJ202603193', sample_type:'鲈鱼成鱼',target:'LMBV',    keyup_ct_1:'32.70',keyup_ct_2:'',     keyup_ct_3:'', remark:'' },
      { sample_id:'JJ202604019', sample_type:'鲈鱼',    target:'LMBV',    keyup_ct_1:'-',    keyup_ct_2:'',     keyup_ct_3:'', remark:'' },
    ]
    this._targetMap = {}
    this._afterDataChanged()
    this._showToast('示例数据已加载', 'success')
  }

  // ─── Clear all ────────────────────────────────────────────────────────────────
  _clearAll() {
    if (!confirm('确认清空当前所有数据？')) return
    this._diqiData      = []
    this._customerRaw   = []
    this._customerHeaders = []
    this._customerData  = []
    this._targetMap     = {}
    this._comparisonRows = []

    const C = this._container
    C.querySelector('#comp-section-mapping').style.display = 'none'
    const df = C.querySelector('#comp-diqi-file');     if (df) df.value = ''
    const cf = C.querySelector('#comp-customer-file'); if (cf) cf.value = ''
    const bt = C.querySelector('#comp-bulk-text');     if (bt) bt.value = ''
    this._clearManualForm()
    this._renderEditableTables()
    this._buildTargetMapTable()
    this._renderStats()
    this._renderComparisonTable()
    this._showToast('已清空全部数据', 'info')
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  _afterDataChanged() {
    this._renderEditableTables()
    this._buildTargetMapTable()
    this._runComparison()
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  _showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container')
    if (!container) return
    const el = document.createElement('div')
    el.className = `toast toast-${type}`
    el.textContent = msg
    container.appendChild(el)
    setTimeout(() => el.remove(), 3500)
  }
}
