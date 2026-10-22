import { isLive } from '@/lib/env';
import { AuthScreen } from '@/features/onboarding/auth-screen';
export const metadata = { title: 'Sign in' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string; password?: string; logout?: string }>;
}) {
  const params = await searchParams;
  const notice = params.auth
    ? 'The authentication link is invalid, expired or cancelled. Sign in or request a new link.'
    : params.password === 'updated'
      ? 'Password updated. Sign in with your new password.'
      : params.logout
        ? 'Sign-out could not be confirmed. Try again before leaving this device.'
        : undefined;
  return (
    <AuthScreen
      mode="signin"
      live={isLive()}
      google={process.env.ATLAS_GOOGLE_OAUTH === 'true'}
      {...(notice ? { notice } : {})}
    />
  );
}
