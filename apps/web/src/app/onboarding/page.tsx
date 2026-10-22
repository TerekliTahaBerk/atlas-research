import { isLive } from '@/lib/env';
import { pageActor } from '@/features/platform/server/pages';
import { loadState } from '@/features/platform/server/services';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { OnboardingScreen } from '@/features/onboarding/onboarding-screen';
export const metadata = { title: 'Onboarding' };
export default async function Page() {
  if (isLive()) {
    const state = await loadState(await pageActor('/onboarding'));
    if (state.profile?.onboardingCompleted) redirect('/app/home');
    return (
      <Suspense>
        <OnboardingScreen
          live
          {...(state.profile ? { draft: state.profile.onboardingDraft } : {})}
        />
      </Suspense>
    );
  }

  return (
    <Suspense>
      <OnboardingScreen />
    </Suspense>
  );
}
