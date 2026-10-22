import { cookies } from 'next/headers';
import { readNavigation } from '@/features/platform/navigation';
import { z } from 'zod';
import { platformCommand, scopeType } from '@atlas/core';
import { verifyActor } from '@/features/identity/server/supabase';
import { authenticate } from '@/features/identity/server/auth-service';
import {
  checkOrigin,
  readJson,
  respond,
} from '@/features/platform/server/http';
import {
  executeCommand,
  directory,
  getProject,
  invitations,
  loadState,
  members,
} from '@/features/platform/server/services';
import { rateLimit } from '@/features/platform/server/limiter';
import { PlatformError } from '@/features/platform/server/errors';
export const dynamic = 'force-dynamic';
export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return respond(async (requestId) => {
    checkOrigin(request);
    const path = (await context.params).path.join('/');
    if (path === 'auth') return authenticate(await readJson(request));
    const actor = await verifyActor();
    await rateLimit(
      path === 'context' ? 'navigation' : 'write',
      actor.id,
      path === 'context' ? 120 : 30,
    );
    if (path === 'context') {
      const input = z
        .object({ workspaceId: z.uuid(), projectId: z.uuid().optional() })
        .strict()
        .parse(await readJson(request));
      await loadState(actor, input.workspaceId);
      if (input.projectId) {
        const project = await getProject(actor, input.projectId);
        if (project.workspaceId !== input.workspaceId)
          throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
      }
      const jar = await cookies();
      const previous = readNavigation(
        jar.get('atlas-navigation')?.value,
        actor.id,
      );
      const projectId =
        input.projectId ??
        (previous?.workspaceId === input.workspaceId
          ? previous.projectId
          : undefined);
      jar.set(
        'atlas-navigation',
        JSON.stringify({
          actorId: actor.id,
          workspaceId: input.workspaceId,
          ...(projectId ? { projectId } : {}),
        }),
        {
          httpOnly: true,
          secure: process.env.ATLAS_ORIGIN?.startsWith('https:') === true,
          sameSite: 'lax',
          path: '/',
          maxAge: 2592000,
        },
      );
      return { selected: true };
    }
    if (path !== 'commands')
      throw new PlatformError('NOT_FOUND', 'Endpoint unavailable.');
    return executeCommand(
      actor,
      platformCommand.parse(await readJson(request)),
      requestId,
    );
  });
}
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return respond(async () => {
    const actor = await verifyActor();
    await rateLimit('read', actor.id, 120);
    const path = (await context.params).path;
    const url = new URL(request.url);
    const listCursor = z
      .string()
      .max(1024)
      .optional()
      .parse(url.searchParams.get('cursor') ?? undefined);
    if (
      path.length === 1 &&
      (path[0] === 'organizations' || path[0] === 'workspaces')
    )
      return directory(actor, path[0], listCursor);
    if (path.join('/') === 'me') {
      const workspaceId = z
        .uuid()
        .optional()
        .parse(url.searchParams.get('workspaceId') ?? undefined);
      const cursor = z
        .string()
        .max(1024)
        .optional()
        .parse(url.searchParams.get('cursor') ?? undefined);
      const organizationId = z
        .uuid()
        .optional()
        .parse(url.searchParams.get('organizationId') ?? undefined);
      return loadState(actor, workspaceId, cursor, organizationId);
    }
    if (path.length === 2 && path[0] === 'projects')
      return getProject(actor, z.uuid().parse(path[1]));
    if (path.length === 3 && path[2] === 'members') {
      const scope = scopeType.parse(path[0]?.replace(/s$/, ''));
      return members(actor, scope, z.uuid().parse(path[1]), listCursor);
    }
    if (path.join('/') === 'invitations') return invitations(actor, listCursor);
    throw new PlatformError('NOT_FOUND', 'Endpoint unavailable.');
  });
}
