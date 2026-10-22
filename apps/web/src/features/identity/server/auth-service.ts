import 'server-only';
import { validRecoveryMarker } from './recovery';
import { z } from 'zod';
import { serverSupabase } from './supabase';
import { safeReturnTo } from '../redirect';
import { rateLimit } from '@/features/platform/server/limiter';
import { PlatformError } from '@/features/platform/server/errors';
export const authInput = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('signin'),
      email: z.email().max(254),
      password: z.string().min(1).max(128),
      returnTo: z.string().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('signup'),
      email: z.email().max(254),
      password: z.string().min(12).max(128),
      confirmation: z.string(),
      displayName: z.string().trim().min(1).max(120),
      returnTo: z.string().optional(),
    })
    .strict(),
  z.object({ action: z.literal('reset'), email: z.email().max(254) }).strict(),
  z
    .object({
      action: z.literal('password'),
      password: z.string().min(12).max(128),
      confirmation: z.string(),
    })
    .strict(),
  z.object({ action: z.literal('logout') }).strict(),
  z
    .object({ action: z.literal('google'), returnTo: z.string().optional() })
    .strict(),
]);
export async function authenticate(raw: unknown) {
  const parsed = authInput.safeParse(raw);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
    const signingIn =
      typeof raw === 'object' &&
      raw !== null &&
      'action' in raw &&
      raw.action === 'signin';
    const message = fields.has('email')
      ? 'Enter a valid email address.'
      : fields.has('password')
        ? signingIn
          ? 'Enter your password (at most 128 characters).'
          : 'Use a password between 12 and 128 characters.'
        : fields.has('displayName')
          ? 'Enter your name (1–120 characters).'
          : fields.has('confirmation')
            ? 'Confirm your password.'
            : 'Check the authentication form and try again.';
    throw new PlatformError('VALIDATION_ERROR', message);
  }
  const input = parsed.data;
  await rateLimit('auth-global', 'all', 300, 60);
  await rateLimit(
    'auth-action',
    'email' in input ? input.email.trim().toLowerCase() : input.action,
    10,
    900,
  );
  const client = await serverSupabase(true);
  const origin = process.env.ATLAS_ORIGIN!;
  if (input.action === 'signin') {
    const { data, error } = await client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.user?.email_confirmed_at)
      throw new PlatformError(
        'UNAUTHENTICATED',
        'Unable to sign in. Check your credentials and email verification.',
      );
    return { redirect: safeReturnTo(input.returnTo) };
  }
  if (input.action === 'signup') {
    if (input.password !== input.confirmation)
      throw new PlatformError('VALIDATION_ERROR', 'Passwords do not match.');
    const { error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeReturnTo(input.returnTo, '/onboarding'))}`,
        data: { display_name: input.displayName },
      },
    });
    if (
      error &&
      !['user_already_exists', 'email_exists'].includes(error.code ?? '')
    )
      throw new PlatformError(
        'EXTERNAL_PROVIDER_ERROR',
        'Unable to request registration. Try again later.',
      );
    return {
      message:
        'If registration is available for this email, check your inbox to verify it before signing in.',
    };
  }
  if (input.action === 'reset') {
    const { error } = await client.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${origin}/auth/callback?flow=recovery`,
    });
    if (error)
      throw new PlatformError(
        'EXTERNAL_PROVIDER_ERROR',
        'Unable to request recovery. Try again later.',
      );
    return {
      message:
        'If an account is eligible, a password reset email will arrive shortly.',
    };
  }
  if (input.action === 'password') {
    if (input.password !== input.confirmation)
      throw new PlatformError('VALIDATION_ERROR', 'Passwords do not match.');
    const { data, error } = await client.auth.getUser();
    if (error || !data.user)
      throw new PlatformError(
        'UNAUTHENTICATED',
        'Recovery session expired. Request a new link.',
      );
    // A short-lived HttpOnly marker is issued only by the successful recovery callback.
    const { cookies } = await import('next/headers');
    const jar = await cookies();
    if (!validRecoveryMarker(jar.get('atlas-recovery')?.value, data.user.id))
      throw new PlatformError(
        'UNAUTHENTICATED',
        'Open a valid password recovery link first.',
      );
    const changed = await client.auth.updateUser({ password: input.password });
    if (changed.error)
      throw new PlatformError(
        'EXTERNAL_PROVIDER_ERROR',
        'Unable to update the password. Request a new recovery link.',
      );
    jar.delete('atlas-recovery');
    const signedOut = await client.auth.signOut();
    if (signedOut.error)
      throw new PlatformError(
        'EXTERNAL_PROVIDER_ERROR',
        'Password updated, but sign-out failed. Sign out before leaving this device.',
      );
    return { redirect: '/login?password=updated' };
  }
  if (input.action === 'logout') {
    const { error } = await client.auth.signOut();
    if (error)
      throw new PlatformError(
        'EXTERNAL_PROVIDER_ERROR',
        'Unable to sign out. Try again.',
      );
    return { redirect: '/login' };
  }
  if (process.env.ATLAS_GOOGLE_OAUTH !== 'true')
    throw new PlatformError('FORBIDDEN', 'Google sign-in is not configured.');
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeReturnTo(input.returnTo))}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url)
    throw new PlatformError(
      'EXTERNAL_PROVIDER_ERROR',
      'Unable to start Google sign-in.',
    );
  return { redirect: data.url };
}
