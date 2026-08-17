import { createClient, SupabaseClient } from '@supabase/supabase-js';

function env(name: string) {
  return process.env[name]?.trim() || '';
}

export function getSupabaseUrl() {
  const url = env('SUPABASE_URL');
  if (url) return url;
  const ref = env('SUPABASE_PROJECT_REF');
  if (ref) return `https://${ref}.supabase.co`;
  throw new Error('SUPABASE_URL is not configured');
}

export function getSupabasePublishableKey() {
  const key = env('SUPABASE_PUBLISHABLE_KEY') || env('SUPABASE_ANON_KEY');
  if (!key) throw new Error('SUPABASE_PUBLISHABLE_KEY is not configured');
  return key;
}

export function getSupabaseSecretKey() {
  const key = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not configured');
  return key;
}

function options() {
  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  } as const;
}

export function getSupabaseAuthClient() {
  return createClient(getSupabaseUrl(), getSupabasePublishableKey(), options());
}

export function getSupabaseAdminClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseSecretKey(), options());
}
