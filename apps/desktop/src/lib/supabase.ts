/* eslint-disable */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://iusnofjubexuwydqsoxw.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1c25vZmp1YmV4dXd5ZHFzb3h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDA4MjMsImV4cCI6MjA5NjIxNjgyM30.wiB218BsSCdB4XLG9XPBKUM9BiwCywjtpEgFjkzUWXE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
