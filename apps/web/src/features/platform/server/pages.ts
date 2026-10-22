import 'server-only';
import { redirect, notFound } from 'next/navigation';
import { z } from 'zod';
import { verifyActor } from '@/features/identity/server/supabase';
import { getProject, loadState } from './services';
import { PlatformError, publicError } from './errors';
export async function pageActor(returnTo = '/app/home') {
  try {
    return await verifyActor();
  } catch (error) {
    if (error instanceof PlatformError && error.code === 'UNAUTHENTICATED')
      redirect(`/login?next=${encodeURIComponent(returnTo)}`);
    throw error;
  }
}
export async function pageState(
  workspaceId?: string,
  cursor?: string,
  organizationId?: string,
) {
  const actor = await pageActor();
  try {
    const state = await loadState(actor, workspaceId, cursor, organizationId);
    if (!state.profile?.onboardingCompleted) redirect('/onboarding');
    return state;
  } catch (error) {
    if (publicError(error).code === 'NOT_FOUND') notFound();
    throw error;
  }
}
export async function pageProject(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const actor = await pageActor(`/app/projects/${id}/overview`);
  try {
    return await getProject(actor, id);
  } catch (error) {
    if (publicError(error).code === 'NOT_FOUND') notFound();
    throw error;
  }
}
