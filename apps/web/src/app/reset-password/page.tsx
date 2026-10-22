import { isLive } from '@/lib/env';
import { AuthScreen } from '@/features/onboarding/auth-screen';
export const metadata = { title: 'Reset password' };
export default function Page() {
  return (
    <AuthScreen
      mode="reset"
      live={isLive()}
      google={process.env.ATLAS_GOOGLE_OAUTH === 'true'}
    />
  );
}
