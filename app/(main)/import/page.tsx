import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ImportClient from './import-client'

export default async function ImportPage() {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .single()

  if (profile?.role !== 'ADMIN' && profile?.role !== 'OPERATOR') {
    redirect('/samples')
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
        <a
          href="/api/export/template"
          className="text-blue-600 text-sm hover:underline"
        >
          下载导入模板
        </a>
      </div>
      <ImportClient />
    </div>
  )
}
