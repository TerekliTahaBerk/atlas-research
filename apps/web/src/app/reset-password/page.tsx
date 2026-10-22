import { AuthScreen } from '@/features/onboarding/auth-screen';
export const metadata = { title: 'Reset password' };
export default function Page() {
  return <AuthScreen mode="reset" />;
}
