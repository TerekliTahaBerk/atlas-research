import { Suspense } from 'react';
import { OnboardingScreen } from '@/features/onboarding/onboarding-screen';
export const metadata = { title: 'Onboarding' };
export default function Page() {
  return (
    <Suspense>
      <OnboardingScreen />
    </Suspense>
  );
}
