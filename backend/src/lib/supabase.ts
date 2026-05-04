import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.SUPABASE_ANON_KEY!
const schema = process.env.SUPABASE_DB_SCHEMA ?? 'sample_data_hub'

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY must be set'
  )
}

/**
 * Service role client — bypasses RLS, use only on server side.
 * Never expose this client or its key to the frontend.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema },
  auth: { persistSession: false },
})

/**
 * Verify a Supabase JWT and return the user, using the anon key for user context.
 */
export const supabaseAnon = createClient(supabaseUrl, anonKey, {
  db: { schema },
  auth: { persistSession: false },
})
