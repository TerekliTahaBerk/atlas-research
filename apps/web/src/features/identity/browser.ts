'use client';
import { createBrowserClient } from '@supabase/ssr';
/** For future browser Auth consumers; SSR uses cookies, never localStorage. */
export function browserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Authentication is not configured.');
  return createBrowserClient(url, key);
}
