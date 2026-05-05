/**
 * Router - 基于 Hash 的 SPA 路由
 * 支持: #/samples  #/sample?id=xxx  #/new  #/edit?id=xxx  #/import  #/review
 */
export class Router {
  constructor() {
    this._modules = {}
    this._container = null
    this._current = null
  }

  /** 注册路由模块。name 对应 hash 路径名 */
  register(name, moduleInstance) {
    this._modules[name] = moduleInstance
  }

  /** 初始化路由，传入内容容器 */
  init(container) {
    this._container = container
    window.addEventListener('hashchange', () => this._dispatch())
    // 首次进入
    if (!location.hash || location.hash === '#') {
      location.replace('#/samples')
    } else {
      this._dispatch()
    }
  }

  /** 解析 hash → { path, params } */
  _parse() {
    const raw = location.hash.replace(/^#\/?/, '') || 'samples'
    const [path, qs] = raw.split('?')
    const params = Object.fromEntries(new URLSearchParams(qs ?? ''))
    return { path, params }
  }

  _dispatch() {
    const { path, params } = this._parse()
    const mod = this._modules[path]
    if (!mod) {
      this._container.innerHTML = `<div class="py-20 text-center text-sm text-gray-400">页面不存在：#/${path}</div>`
      return
    }
    this._current = path
    mod.render(this._container, params)
  }

  /** 手动导航到某个路由 */
  go(path) {
    // 支持传入 '/sample?id=x'、'sample?id=x'、'#/sample?id=x' 三种格式
    if (path.startsWith('#')) {
      location.hash = path
    } else {
      location.hash = '#/' + path.replace(/^\/+/, '')
    }
  }

  /** 重新渲染当前路由（profile 加载后补刷用） */
  redispatch() {
    if (this._container) this._dispatch()
  }
}

export const router = new Router()
