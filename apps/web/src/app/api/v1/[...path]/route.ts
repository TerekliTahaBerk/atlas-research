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
    await rateLimit('write', actor.id);
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
      return loadState(actor, workspaceId, cursor);
    }
    if (path.length === 2 && path[0] === 'projects')
      return getProject(actor, z.uuid().parse(path[1]));
    if (path.length === 3 && path[2] === 'members') {
      const scope = scopeType.parse(path[0]?.replace(/s$/, ''));
      return members(actor, scope, z.uuid().parse(path[1]));
    }
    if (path.join('/') === 'invitations') return invitations(actor);
    throw new PlatformError('NOT_FOUND', 'Endpoint unavailable.');
  });
}
