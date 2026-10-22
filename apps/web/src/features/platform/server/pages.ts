import { cookies } from 'next/headers';
import 'server-only';
import { redirect, notFound } from 'next/navigation';
import { z } from 'zod';
import { verifyActor } from '@/features/identity/server/supabase';
import { getProject, loadState } from './services';
import { PlatformError, publicError } from './errors';
import { readNavigation } from '../navigation';
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
  if (
    (workspaceId && !z.uuid().safeParse(workspaceId).success) ||
    (organizationId && !z.uuid().safeParse(organizationId).success) ||
    (cursor && cursor.length > 1024)
  )
    notFound();
  const actor = await pageActor();
  try {
    const jar = await cookies();
    const navigation = readNavigation(
      jar.get('atlas-navigation')?.value,
      actor.id,
    );
    const preferred =
      !organizationId && !workspaceId ? navigation?.workspaceId : undefined;
    let state;
    try {
      state = await loadState(
        actor,
        workspaceId ?? preferred,
        cursor,
        organizationId,
      );
    } catch (error) {
      if (preferred && publicError(error).code === 'NOT_FOUND')
        state = await loadState(actor, undefined, undefined, organizationId);
      else throw error;
    }
    if (navigation?.projectId)
      try {
        const recent = await getProject(actor, navigation.projectId);
        if (recent.workspaceId === state.workspaceId && !recent.archived)
          state.recentProject = recent;
      } catch (error) {
        if (publicError(error).code !== 'NOT_FOUND') throw error;
      }

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
