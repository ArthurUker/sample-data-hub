/**
 * AuthService - 认证服务
 * 封装 Supabase 认证，提供单例 client 和用户状态管理
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SCHEMA } from '../config.js'

const { createClient } = window.supabase

let _client = null

/** 获取单例 Supabase client */
export function getSupabase() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: SUPABASE_SCHEMA || 'sample_data_hub' },
      auth: {
        persistSession: true,
        storage: window.localStorage,
        detectSessionInUrl: false,
      },
    })
  }
  return _client
}

/**
 * 从 localStorage 同步读取用户（避免页面刷新时白屏等待）
 * 不做任何 token 刷新，刷新由 Supabase autoRefreshToken 负责。
 */
export function readStoredUser() {
  try {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
    if (!key) return null
    const p = JSON.parse(localStorage.getItem(key))
    const nowSec = Math.floor(Date.now() / 1000)
    if (p.expires_at && p.expires_at < nowSec) return null
    return p.user ?? null
  } catch { return null }
}

export class AuthService {
  constructor() {
    this._user = null
    this._profile = null
    this._listeners = []
  }

  getUser()    { return this._user }
  getProfile() { return this._profile }
  getSupabase() { return getSupabase() }

  /**
   * 初始化：监听 Supabase auth 状态变化
   * onStateChange(user, profile) 在状态变化时调用
   */
  init(onStateChange) {
    const supabase = getSupabase()
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        this._user = null
        this._profile = null
        onStateChange(null, null)
        return
      }
      const user = session?.user ?? null
      this._user = user
      if (user) {
        const profile = await this._loadProfile(user.id)
        this._profile = profile
        onStateChange(user, profile)
      } else {
        onStateChange(null, null)
      }
    })
  }

  async _loadProfile(userId) {
    try {
      const { data } = await Promise.race([
        getSupabase().from('profiles').select('id, name, role').eq('id', userId).single(),
        new Promise((resolve) => setTimeout(() => resolve({ data: null }), 6000)),
      ])
      return data ?? null
    } catch { return null }
  }

  async login(email, password) {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async logout() {
    await getSupabase().auth.signOut()
    window.location.replace('./login.html')
  }
}

export const authService = new AuthService()
