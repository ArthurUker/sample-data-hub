import { createBrowserClient } from '@supabase/ssr'

type BrowserClient = ReturnType<typeof createBrowserClient>

let browserClient: BrowserClient | null = null

export function createClient(): BrowserClient {
  if (browserClient) return browserClient

  const schema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA ?? 'sample_data_hub'

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema },
      auth: {
        persistSession: true,
        // 静态导出场景：显式指定 localStorage 作为 session 存储介质，确保页面刷新后 session 不丢失
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        detectSessionInUrl: false,
      },
    }
  )

  return browserClient!
}
