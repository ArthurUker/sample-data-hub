'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { downloadTemplate } from '@/lib/api-client'
import ImportClient from './import-client'

export default function ImportPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const canImport = profile?.role === 'ADMIN' || profile?.role === 'OPERATOR'

  useEffect(() => {
    if (authLoading) return
    if (!profile) router.replace('/login')
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

  if (!canImport) {
    return (
      <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-xl font-semibold text-gray-900">Excel 导入</h1>
        <p className="text-sm text-gray-500 mt-2">
          当前账号没有 Excel 导入权限。请联系管理员开通录入员或管理员角色。
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/samples"
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            返回样本台账
          </Link>
          <Link
            href="/samples"
            className="text-sm px-4 py-2 rounded-lg text-blue-600 hover:underline"
          >
            查看样本列表
          </Link>
        </div>
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

      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        也可以使用
        <Link href="/samples/new" className="ml-1 font-medium underline">
          手工录入
        </Link>
        逐条创建样本与记录。
      </div>

      <ImportClient />
    </div>
  )
}
