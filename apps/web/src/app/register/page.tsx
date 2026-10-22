import { AuthScreen } from '@/features/onboarding/auth-screen';
export const metadata = { title: 'Create account' };
export default function Page() {
  return <AuthScreen mode="signup" />;
}
