import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

type BrowserClient = SupabaseClient<any, any, any>

let browserClient: BrowserClient | null = null

export function createClient(): BrowserClient {
  if (browserClient) return browserClient

  const schema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA ?? 'sample_data_hub'

  browserClient = createSupabaseClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: schema as any },
      auth: {
        persistSession: true,
        // 静态站点场景：统一使用 localStorage 持久化会话，避免 cookie 路径/编码差异导致的会话读取失败。
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        detectSessionInUrl: false,
      },
    }
  )

  return browserClient!
}
