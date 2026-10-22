import { isLive } from '@/lib/env';
import { AuthScreen } from '@/features/onboarding/auth-screen';
export const metadata = { title: 'Create account' };
export default function Page() {
  return (
    <AuthScreen
      mode="signup"
      live={isLive()}
      google={process.env.ATLAS_GOOGLE_OAUTH === 'true'}
    />
  );
}
