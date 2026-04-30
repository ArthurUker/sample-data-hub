'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import RecordForm from './record-form'

export default function EditSampleClient() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id') ?? ''
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const [sample, setSample] = useState<{ id: string; sample_type: string } | null>(null)
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (profile && profile.role !== 'ADMIN' && profile.role !== 'OPERATOR') {
      router.replace(`/samples/detail?id=${id}`)
      return
    }

    const supabase = createClient()
    Promise.all([
      supabase.from('samples').select('id, sample_type').eq('id', id).single(),
      supabase.from('sites').select('id, name').order('name'),
    ]).then(([{ data: sampleData }, { data: sitesData }]) => {
      if (!sampleData) { router.replace('/samples'); return }
      setSample(sampleData)
      setSites(sitesData ?? [])
      setLoading(false)
    })
  }, [id, user, profile, authLoading, router])

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        加载中...
      </div>
    )
  }

  if (!sample) return null

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <a href={`/samples/detail?id=${id}`} className="text-sm text-gray-400 hover:text-gray-600">
          ← {sample.id}
        </a>
        <h1 className="text-xl font-semibold text-gray-900 mt-1">新增检测记录</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          录入后将生成新版本并自动重算比对结果
        </p>
      </div>
      <RecordForm sampleId={id} sites={sites} operatorId={user?.id ?? ''} />
    </div>
  )
}
