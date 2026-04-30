import { createClient } from '@/lib/supabase/client'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

async function getAuthHeader(): Promise<Record<string, string>> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const authHeader = await getAuthHeader()
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(init.headers ?? {}),
    },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API ${path} failed [${resp.status}]: ${text}`)
  }
  return resp.json()
}

// ——— 导出 / 导入 ———
export async function downloadTemplate(): Promise<Blob> {
  const authHeader = await getAuthHeader()
  const resp = await fetch(`${API_BASE}/api/export/template`, {
    headers: authHeader,
  })
  if (!resp.ok) throw new Error('模板下载失败')
  return resp.blob()
}

export async function exportSamples(sampleIds?: string[]): Promise<Blob> {
  const authHeader = await getAuthHeader()
  const qs = sampleIds?.length ? `?sampleIds=${sampleIds.join(',')}` : ''
  const resp = await fetch(`${API_BASE}/api/export${qs}`, {
    headers: authHeader,
  })
  if (!resp.ok) throw new Error('导出失败')
  return resp.blob()
}

export async function importExcel(file: File): Promise<{
  imported: number
  errors: string[]
}> {
  const authHeader = await getAuthHeader()
  const formData = new FormData()
  formData.append('file', file)
  const resp = await fetch(`${API_BASE}/api/import`, {
    method: 'POST',
    headers: authHeader, // 不设 Content-Type，让浏览器自动填 boundary
    body: formData,
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`导入失败: ${text}`)
  }
  return resp.json()
}

export async function triggerCompare(sampleId: string): Promise<void> {
  await apiFetch(`/api/samples/${sampleId}/compare`, { method: 'POST' })
}

export { apiFetch }
