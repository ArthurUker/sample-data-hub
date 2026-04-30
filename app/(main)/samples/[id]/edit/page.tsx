import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import RecordForm from './record-form'

export default async function EditSamplePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: sample }, { data: profile }, { data: sites }] =
    await Promise.all([
      supabase.from('samples').select('id, sample_type').eq('id', id).single(),
      supabase.from('profiles').select('role, id').single(),
      supabase.from('sites').select('id, name').order('name'),
    ])

  if (!sample) notFound()

  if (profile?.role !== 'ADMIN' && profile?.role !== 'OPERATOR') {
    redirect(`/samples/${id}`)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <a
          href={`/samples/${id}`}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← {sample.id}
        </a>
        <h1 className="text-xl font-semibold text-gray-900 mt-1">
          新增检测记录
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          录入后将生成新版本并自动重算比对结果
        </p>
      </div>

      <RecordForm
        sampleId={id}
        sites={sites ?? []}
        operatorId={profile?.id ?? ''}
      />
    </div>
  )
}
