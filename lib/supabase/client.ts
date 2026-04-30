import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const schema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA ?? 'sample_data_hub'

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: {
        schema,
      },
    }
  )
}
