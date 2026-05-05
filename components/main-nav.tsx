'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

const navItems: Array<{
  href: string
  label: string
}> = [
  { href: '/samples', label: '样本台账' },
  { href: '/review', label: '差异审核' },
  { href: '/samples/new', label: '数据录入' },
  { href: '/import', label: 'Excel 导入' },
]

const roleLabel: Record<UserRole, string> = {
  ADMIN: '管理员',
  OPERATOR: '录入员',
  REVIEWER: '审核人',
  VIEWER: '只读',
}

export default function MainNav({
  userName,
  userRole,
}: {
  userName: string
  userRole: UserRole
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-gray-900 text-sm">样本数据平台</span>
          <nav className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  pathname.startsWith(item.href)
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{userName}</span>
          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
            {roleLabel[userRole]}
          </span>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            退出
          </button>
        </div>
      </div>
    </header>
  )
}
