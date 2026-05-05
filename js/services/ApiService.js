/**
 * ApiService - Railway 后端 API 调用
 * 负责附带 Bearer token 的请求
 */
import { API_BASE_URL } from '../config.js'
import { getSupabase } from './AuthService.js'

async function getAuthHeader() {
  const { data: { session } } = await getSupabase().auth.getSession()
  if (!session?.access_token) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

async function apiFetch(path, init = {}) {
  const authHeader = await getAuthHeader()
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(init.headers ?? {}),
    },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API ${path} 失败 [${resp.status}]: ${text}`)
  }
  return resp.json()
}

/** 触发比对计算（Railway 后端） */
export async function triggerCompare(sampleId) {
  return apiFetch(`/api/samples/${sampleId}/compare`, { method: 'POST' })
}

/** 下载导入模板 */
export async function downloadTemplate() {
  const authHeader = await getAuthHeader()
  const resp = await fetch(`${API_BASE_URL}/api/export/template`, { headers: authHeader })
  if (!resp.ok) throw new Error('模板下载失败')
  return resp.blob()
}

/** 导出样本数据 */
export async function exportSamples(sampleIds) {
  const authHeader = await getAuthHeader()
  const qs = sampleIds?.length ? `?sampleIds=${sampleIds.join(',')}` : ''
  const resp = await fetch(`${API_BASE_URL}/api/export${qs}`, { headers: authHeader })
  if (!resp.ok) throw new Error('导出失败')
  return resp.blob()
}
