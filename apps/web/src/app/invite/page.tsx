import { isLive } from '@/lib/env';
import { notFound } from 'next/navigation';
import { verifyActor } from '@/features/identity/server/supabase';
import { PlatformError } from '@/features/platform/server/errors';
import { InviteScreen } from '@/features/platform/invite-screen';
export default async function Page() {
  if (!isLive()) notFound();
  let signedIn = false;
  try {
    await verifyActor();
    signedIn = true;
  } catch (error) {
    if (!(error instanceof PlatformError) || error.code !== 'UNAUTHENTICATED')
      throw error;
  }
  return <InviteScreen signedIn={signedIn} />;
}
