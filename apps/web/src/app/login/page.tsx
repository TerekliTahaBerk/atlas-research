import { AuthScreen } from '@/features/onboarding/auth-screen';
export const metadata = { title: 'Sign in' };
export default function Page() {
  return <AuthScreen mode="signin" />;
}
