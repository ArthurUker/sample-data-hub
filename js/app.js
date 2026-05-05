/**
 * app.js - 应用入口
 * 负责：认证守卫、导航栏初始化、路由注册
 */
import { authService, readStoredUser } from './services/AuthService.js'
import { router } from './core/Router.js'
import { SamplesModule }     from './modules/Samples.js'
import { SampleDetailModule } from './modules/SampleDetail.js'
import { SampleEditModule }   from './modules/SampleEdit.js'
import { ImportModule }       from './modules/Import.js'
import { ReviewModule }       from './modules/Review.js'

// ── Toast 工具函数（供所有模块使用）─────────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container')
  if (!container) return
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.textContent = message
  container.appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

// ── 导航栏激活状态 ───────────────────────────────────────────────────────────
function updateNavActive() {
  const hash = location.hash.replace(/^#\/?/, '').split('?')[0] || 'samples'
  document.querySelectorAll('.nav-link').forEach((a) => {
    const route = a.dataset.route
    const active = route === hash || (hash === 'sample' && route === 'samples')
    a.classList.toggle('bg-blue-50',    active)
    a.classList.toggle('text-blue-700', active)
    a.classList.toggle('font-medium',   active)
    a.classList.toggle('text-gray-600', !active)
  })
}
window.addEventListener('hashchange', updateNavActive)

// ── 角色控制导航项可见性 ─────────────────────────────────────────────────────
function applyRoleVisibility(role) {
  const isOperator = role === 'ADMIN' || role === 'OPERATOR'
  const isReviewer = role === 'ADMIN' || role === 'REVIEWER'

  document.querySelectorAll('.operator-only').forEach((el) => el.classList.toggle('hidden', !isOperator))
  document.querySelectorAll('.reviewer-only').forEach((el) => el.classList.toggle('hidden', !isReviewer))
}

const ROLE_LABEL = { ADMIN: '管理员', OPERATOR: '录入员', REVIEWER: '审核人', VIEWER: '只读' }

// ── 初始化 ───────────────────────────────────────────────────────────────────
async function init() {
  // 快速同步读取 localStorage — 防止白屏等待
  const storedUser = readStoredUser()
  if (!storedUser) {
    window.location.replace('./login.html')
    return
  }

  // 立即显示主界面（使用缓存的用户信息，避免闪屏）
  document.getElementById('loading-screen').classList.add('hidden')
  document.getElementById('main-layout').classList.remove('hidden')
  document.getElementById('nav-username').textContent = storedUser.email ?? ''

  // 注册路由模块
  const samplesModule = new SamplesModule(authService)
  const detailModule  = new SampleDetailModule(authService)
  const editModule    = new SampleEditModule(authService)
  const importModule  = new ImportModule(authService)
  const reviewModule  = new ReviewModule(authService)

  const content = document.getElementById('content-area')

  router.register('samples', { render: (c, p) => samplesModule.render(c, p) })
  router.register('sample',  { render: (c, p) => detailModule.render(c, p) })
  router.register('new',     { render: (c, p) => editModule.render(c, p) })
  router.register('edit',    { render: (c, p) => editModule.render(c, p) })
  router.register('import',  { render: (c)    => importModule.render(c) })
  router.register('review',  { render: (c)    => reviewModule.render(c) })

  router.init(content)
  updateNavActive()

  // 退出按钮
  document.getElementById('logout-btn')?.addEventListener('click', () => authService.logout())

  // 异步初始化真实 auth 状态（会在 INITIAL_SESSION 回调中更新用户信息）
  authService.init((user, profile) => {
    if (!user) {
      window.location.replace('./login.html')
      return
    }
    // 更新导航栏
    document.getElementById('nav-username').textContent = profile?.name || user.email || ''
    document.getElementById('nav-role').textContent = ROLE_LABEL[profile?.role] ?? ''
    applyRoleVisibility(profile?.role ?? 'VIEWER')
  })
}

init()
