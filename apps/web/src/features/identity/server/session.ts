import 'server-only';
import { serverSupabase } from './supabase';
import { PlatformError } from '@/features/platform/server/errors';
export async function verifyActor() {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (
    error ||
    !data.user?.email ||
    !data.user.email_confirmed_at ||
    data.user.is_anonymous
  )
    throw new PlatformError(
      'UNAUTHENTICATED',
      'Sign in with a verified email address.',
    );
  return { id: data.user.id, email: data.user.email };
}
