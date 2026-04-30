'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AuthProvider } from '@/lib/auth-context'
import { useAuth } from '@/lib/auth-context'
import MainNav from '@/components/main-nav'

function MainLayoutInner({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [loading, user, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">加载中...</p>
      </div>
    )
  }

  if (!user) return null

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

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <MainLayoutInner>{children}</MainLayoutInner>
    </AuthProvider>
  )
}
