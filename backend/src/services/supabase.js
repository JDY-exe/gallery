import { createClient } from '@supabase/supabase-js'

export function createSupabaseServices(config) {
  const hasUrl = Boolean(config.supabase.url)
  const anonClient =
    hasUrl && config.supabase.anonKey
      ? createClient(config.supabase.url, config.supabase.anonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
      : null

  const serviceClient =
    hasUrl && config.supabase.serviceRoleKey
      ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
      : null

  return {
    supabase: {
      anonClient,
      serviceClient,
    },
  }
}
