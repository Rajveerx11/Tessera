import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Lazily creates the Supabase client on first use. The client must NOT be
 * created at module load: this module is statically reachable from the app
 * shell, and `createClient` throws when the URL is empty — which would crash
 * the whole app at startup in environments without Supabase configuration
 * (e.g. CI / e2e). Boards features surface the error only when actually used.
 */
export function getSupabase(): SupabaseClient {
  if (client === null) {
    const url: unknown = import.meta.env.VITE_SUPABASE_URL;
    const anonKey: unknown = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (typeof url !== 'string' || url === '' || typeof anonKey !== 'string' || anonKey === '') {
      throw new Error(
        'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use Boards.',
      );
    }
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
