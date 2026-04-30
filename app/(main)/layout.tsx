import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MainNav from '@/components/main-nav'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav
        userName={profile?.name ?? user.email ?? '用户'}
        userRole={profile?.role ?? 'VIEWER'}
      />
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
