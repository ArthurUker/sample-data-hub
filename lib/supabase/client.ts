// Mark this module as client-only to avoid referencing `window` during server-side builds
'use client'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

type BrowserClient = SupabaseClient<any, any, any>

let browserClient: BrowserClient | null = null

export function createClient(): BrowserClient {
  if (browserClient) return browserClient
  const schema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA ?? 'sample_data_hub'

  // Safely resolve browser storage. Use try/catch because in some build/runtime
  // environments a direct reference to `window` can throw a ReferenceError.
  let storage: Storage | undefined = undefined
  try {
    if (typeof window !== 'undefined') storage = window.localStorage
  } catch (_) {
    storage = undefined
  }

  browserClient = createSupabaseClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: schema as any },
      auth: {
        persistSession: true,
        storage,
        detectSessionInUrl: false,
      },
    }
  )

  return browserClient!
}
