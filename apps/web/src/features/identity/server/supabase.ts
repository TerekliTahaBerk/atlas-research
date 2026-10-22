import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PlatformError } from '@/features/platform/server/errors';
export async function serverSupabase(writable = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.ATLAS_MODE !== 'live' || !url || !key)
    throw new PlatformError(
      'UNAUTHENTICATED',
      'Authentication is not configured.',
    );
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      secure: process.env.ATLAS_ORIGIN?.startsWith('https://') === true,
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        if (writable)
          for (const { name, value, options } of values)
            jar.set(name, value, options);
      },
    },
  });
}
export { verifyActor } from './session';
