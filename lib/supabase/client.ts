import { createClient as _createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: ReturnType<typeof _createClient> | null = null

export function createClient() {
  if (browserClient) return browserClient

  const schema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA ?? 'sample_data_hub'

  // 静态导出站点使用 supabase-js 原生客户端，session 会自动持久化到 localStorage
  browserClient = _createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema },
      auth: {
        persistSession: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        detectSessionInUrl: false,
      },
    }
  )

  return browserClient
}
