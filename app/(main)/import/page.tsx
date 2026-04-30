'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { downloadTemplate } from '@/lib/api-client'
import ImportClient from './import-client'

export default function ImportPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (profile && profile.role !== 'ADMIN' && profile.role !== 'OPERATOR') {
      router.replace('/samples')
    }
  }, [profile, authLoading, router])

  async function handleDownloadTemplate() {
    try {
      const blob = await downloadTemplate()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'import_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('模板下载失败')
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        加载中...
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Excel 导入</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            批量导入检测记录；每行代表一个检测项目
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="text-blue-600 text-sm hover:underline"
        >
          下载导入模板
        </button>
      </div>
      <ImportClient />
    </div>
  )
}
